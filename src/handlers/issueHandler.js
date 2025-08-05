const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { callAI } = require('../services/ai');
const { closeIssue, addComment, addLabels, getReadmeContent } = require('../services/github');

/**
 * 处理新创建的Issue
 * @param {Object} octokit GitHub API客户端
 * @param {Object} openai OpenAI客户端
 * @param {Object} context GitHub上下文
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {string} aiModel AI模型名
 * @param {Object} config 配置对象
 * @param {Array} labelsList 标签列表
 * @param {Array} blacklistUsers 黑名单用户列表
 */
async function handleNewIssue(octokit, openai, context, owner, repo, aiModel, config, labelsList, blacklistUsers) {
  try {
    const issue = context.payload.issue;
    const issueTitle = issue.title;
    const issueBody = issue.body || '';
    const issueAuthor = issue.user.login.toLowerCase();
    
    core.info(logMessage(config.logging.issue_check_start, { title: issueTitle }));
    core.info(logMessage(config.logging.target_repo, { owner, repo }));
    
    // 检查用户是否在黑名单中
    if (blacklistUsers.includes(issueAuthor)) {
      await handleBlacklistedUser(octokit, owner, repo, issue, config);
      return;
    }
    
    // 获取README.md内容
    const readmeContent = await getReadmeContent(octokit, owner, repo, config);
    if (readmeContent) {
      core.info(config.logging.readme_found);
    } else {
      core.warning(config.logging.readme_not_found);
    }
    
    // 构建AI检查提示
    const prompt = config.prompts.issue_detection
      .replace('{readme_content}', readmeContent)
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody);
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'Issue检测');
    
    if (decision === 'CLOSE') {
      await handleSpamIssue(octokit, owner, repo, issue, config);
    } else if (decision === 'UNCLEAR') {
      await handleUnclearIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
    } else {
      await handleValidIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.issue_process_error, { error: error.message }));
    throw error;
  }
}

/**
 * 处理黑名单用户的Issue
 */
async function handleBlacklistedUser(octokit, owner, repo, issue, config) {
  const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_closed.replace('{readme_url}', readmeUrl),
    config,
    true
  );
  
  core.info(logMessage(config.logging.issue_closed_log, { number: issue.number }));
}

/**
 * 处理垃圾Issue
 */
async function handleSpamIssue(octokit, owner, repo, issue, config) {
  const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_closed.replace('{readme_url}', readmeUrl),
    config,
    true
  );
  
  core.info(logMessage(config.logging.issue_closed_log, { number: issue.number }));
}

/**
 * 处理描述不清的Issue
 */
async function handleUnclearIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList) {
  await addComment(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_unclear,
    config.logging.issue_unclear_comment_failed
  );
  
  core.info(logMessage(config.logging.issue_unclear_log, { number: issue.number }));
  
  // 对于描述不清的Issue，也进行分类并添加标签
  await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
}

/**
 * 处理有效Issue
 */
async function handleValidIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList) {
  core.info(logMessage(config.logging.issue_passed_log, { number: issue.number }));
  
  // 对于通过检查的Issue，进行分类并添加标签
  await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
}

/**
 * 对Issue进行分类并添加标签
 */
async function classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList) {
  try {
    core.info(logMessage(config.logging.classification_start, { number: issue.number }));
    core.info(logMessage(config.logging.available_labels, { labels: labelsList.join(', ') }));
    
    // 使用配置文件中的分类提示模板
    const labelsOptions = labelsList.map(l => l.toUpperCase()).join('、');
    
    const classificationPrompt = config.prompts.issue_classification
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody)
      .replace('{labels_options}', labelsOptions);
    
    // 调用AI进行分类
    let classification;
    try {
      classification = await callAI(openai, aiModel, classificationPrompt, config, 'Issue分类');
    } catch (aiError) {
      core.error(logMessage(config.logging.classification_failed, { error: aiError.message }));
      return;
    }
    
    // 查找匹配的标签
    const matchedLabel = labelsList.find(label => 
      classification.toUpperCase() === label.toUpperCase()
    );
    
    if (matchedLabel) {
      try {
        await addLabels(
          octokit, 
          owner, 
          repo, 
          issue.number, 
          [matchedLabel],
          config.logging.label_add_api_failed
        );
        core.info(logMessage(config.logging.label_added, { number: issue.number, label: matchedLabel }));
      } catch (labelError) {
        core.warning(logMessage(config.logging.label_add_failed, { error: labelError.message }));
      }
    } else {
      core.info(logMessage(config.logging.label_no_match, { number: issue.number, classification }));
    }
    
  } catch (error) {
    core.warning(logMessage(config.logging.classification_process_error, { error: error.message }));
  }
}

module.exports = {
  handleNewIssue
};
