const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { getReadmeContent, getPinnedIssuesContent } = require('../services/github');
const { analyzeIssueQuality, generateAnalysisReport } = require('../services/templateDetector');
const IssueWorkflowService = require('../services/issueWorkflowService');
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
    
    // 创建工作流服务实例
    const workflowService = new IssueWorkflowService(octokit, openai, aiModel, config);
    
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
    logTemplateDetectionInfo(qualityAnalysis, config);

    // 调用AI进行垃圾检测
    const decision = await workflowService.performSpamDetection(
      issue, 
      readmeContent, 
      pinnedIssuesContent, 
      templateAnalysisReport
    );
    
    if (decision === 'SPAM') {
      await handleSpamIssue(octokit, owner, repo, issue, config);
    } else if (decision === 'README_COVERED') {
      // README相关的Issue：先回答，再关闭但不锁定
      await workflowService.handleReadmeRelatedIssue(owner, repo, issue, readmeContent);
    } else if (decision === 'BASIC') {
      await handleBasicIssue(octokit, owner, repo, issue, config);
    } else if (decision === 'UNCLEAR') {
      await handleUnclearIssue(octokit, owner, repo, issue, config);
      await workflowService.classifyAndLabelIssue(owner, repo, issue, qualityAnalysis, labelsList);
    } else {
      // 对于通过初始检测的Issue，进一步检查是否与README相关（双重检查）
      const isReadmeRelated = await workflowService.checkAndHandleReadmeRelevance(owner, repo, issue, readmeContent);
      if (!isReadmeRelated) {
        await handleValidIssue(workflowService, owner, repo, issue, qualityAnalysis, labelsList);
      }
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.issue_process_error, { error: error.message }));
    throw error;
  }
}

/**
 * 处理有效Issue
 */
async function handleValidIssue(workflowService, owner, repo, issue, qualityAnalysis, labelsList) {
  core.info(logMessage(workflowService.config.logging.issue_passed_log, { number: issue.number }));
  
  // 对于通过检查的Issue，进行分类并添加标签
  await workflowService.classifyAndLabelIssue(owner, repo, issue, qualityAnalysis, labelsList);
}

/**
 * 记录模板检测信息
 */
function logTemplateDetectionInfo(qualityAnalysis, config) {
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
}

module.exports = {
  handleNewIssue
};
