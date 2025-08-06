const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { callAI } = require('../services/ai');
const { addLabels, getReadmeContent, getPinnedIssuesContent } = require('../services/github');
const { analyzeIssueQuality, generateAnalysisReport } = require('../services/templateDetector');
const { 
  handleSpamIssue, 
  handleBasicIssue, 
  handleUnclearIssue, 
  handleBlacklistedUser 
} = require('./issueProcessor');

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

    // 获取置顶Issues内容
    const pinnedIssuesContent = await getPinnedIssuesContent(octokit, owner, repo, config);
    if (pinnedIssuesContent) {
      core.info(config.logging.pinned_issues_found);
    } else {
      core.warning(config.logging.pinned_issues_not_found);
    }

    // 智能分析Issue内容质量和模板使用情况
    const qualityAnalysis = analyzeIssueQuality(issueTitle, issueBody);
    const templateAnalysisReport = generateAnalysisReport(
      qualityAnalysis.templateInfo, 
      qualityAnalysis.contentInfo
    );

    // 记录模板检测信息
    if (qualityAnalysis.templateInfo.hasTemplate) {
      core.info(logMessage(config.logging.template_detected, {
        type: qualityAnalysis.templateInfo.templateType,
        confidence: qualityAnalysis.templateInfo.confidence.toFixed(1)
      }));
      
      core.info(logMessage(config.logging.template_analysis, {
        sections: qualityAnalysis.contentInfo.validSections
      }));

      if (qualityAnalysis.contentInfo.userContent) {
        core.info(logMessage(config.logging.user_content_extracted, {
          length: qualityAnalysis.contentInfo.userContent.length
        }));
      }
    }

    // 记录内容质量分析
    core.info(logMessage(config.logging.quality_analysis, {
      level: qualityAnalysis.quality.level,
      score: qualityAnalysis.quality.score
    }));

    // 构建AI检查提示，包含模板分析信息
    const prompt = config.prompts.issue_detection
      .replace('{readme_content}', readmeContent)
      .replace('{pinned_issues_content}', pinnedIssuesContent)
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody)
      .replace('{template_analysis}', templateAnalysisReport);
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'Issue检测');
    
    if (decision === 'CLOSE') {
      await handleSpamIssue(octokit, owner, repo, issue, config);
    } else if (decision === 'BASIC') {
      await handleBasicIssue(octokit, owner, repo, issue, config);
    } else if (decision === 'UNCLEAR') {
      await handleUnclearIssue(octokit, owner, repo, issue, config);
      await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList, qualityAnalysis);
    } else {
      await handleValidIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList, qualityAnalysis);
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.issue_process_error, { error: error.message }));
    throw error;
  }
}

/**
 * 处理有效Issue
 */
async function handleValidIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList, qualityAnalysis) {
  core.info(logMessage(config.logging.issue_passed_log, { number: issue.number }));
  
  // 对于通过检查的Issue，进行分类并添加标签
  await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList, qualityAnalysis);
}

/**
 * 对Issue进行分类并添加标签
 */
async function classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList, qualityAnalysis) {
  try {
    core.info(logMessage(config.logging.classification_start, { number: issue.number }));
    core.info(logMessage(config.logging.available_labels, { labels: labelsList.join(', ') }));
    
    // 使用配置文件中的分类提示模板
    const labelsOptions = labelsList.map(l => l.toUpperCase()).join('、');
    
    // 优先使用提取的用户内容，如果没有则使用原始内容
    const contentForClassification = qualityAnalysis && qualityAnalysis.contentInfo.userContent 
      ? qualityAnalysis.contentInfo.userContent 
      : issueBody;
    
    const classificationPrompt = config.prompts.issue_classification
      .replace('{issue_title}', issueTitle)
      .replace('{user_content}', contentForClassification)
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
