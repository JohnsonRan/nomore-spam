const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const IssueAnalyzer = require('../services/issueAnalyzer');
const ClassificationService = require('../services/classificationService');
const IssueActionService = require('../services/issueActionService');

/**
 * Issue工作流服务 - 负责协调各种Issue处理流程
 */
class IssueWorkflowService {
  constructor(octokit, openai, aiModel, config) {
    this.analyzer = new IssueAnalyzer(openai, aiModel, config);
    this.classifier = new ClassificationService(openai, aiModel, config);
    this.actionService = new IssueActionService(octokit, config);
    this.config = config;
  }

  /**
   * 处理README相关的Issue - 先回答，再关闭但不锁定
   */
  async handleReadmeRelatedIssue(owner, repo, issue, readmeContent) {
    try {
      // 先生成并添加基于README的回答
      const readmeAnswer = await this.analyzer.generateReadmeAnswer(issue, readmeContent);
      await this.actionService.addReadmeAnswer(owner, repo, issue.number, readmeAnswer);
      
      // 然后关闭Issue但不锁定，允许继续讨论
      await this.actionService.closeReadmeCoveredIssue(owner, repo, issue);
      
      return true;
    } catch (error) {
      core.error(logMessage(this.config.logging.readme_answer_failed, { 
        number: issue.number, 
        error: error.message 
      }));
      return false;
    }
  }

  /**
   * 智能处理 UNCLEAR 的 Issue
   * 尝试结合 README 提供有用信息，如果无法提供才使用标准提示
   */
  async handleUnclearIssueSmartly(owner, repo, issue, readmeContent) {
    try {
      // 尝试生成智能回答
      if (readmeContent) {
        const smartAnswer = await this.analyzer.generateSmartAnswerForUnclear(issue, readmeContent);
        
        if (smartAnswer) {
          // 能够提供有用的回答
          core.info(logMessage(this.config.logging.unclear_smart_answer_generated, { number: issue.number }));
          await this.actionService.addUnclearSmartAnswer(owner, repo, issue.number, smartAnswer);
          return true;
        }
      }
      
      // 无法生成智能回答，回退到标准提示
      core.info(logMessage(this.config.logging.unclear_fallback_to_standard, { number: issue.number }));
      await this.actionService.addComment(
        owner, 
        repo, 
        issue.number, 
        this.config.responses.issue_unclear,
        this.config.logging.issue_unclear_comment_failed
      );
      
      return false;
    } catch (error) {
      core.error(logMessage(this.config.logging.unclear_smart_answer_failed, { 
        number: issue.number, 
        error: error.message 
      }));
      
      // 出错时回退到标准提示
      await this.actionService.addComment(
        owner, 
        repo, 
        issue.number, 
        this.config.responses.issue_unclear,
        this.config.logging.issue_unclear_comment_failed
      );
      
      return false;
    }
  }

  /**
   * 检查README相关性并处理（用于双重检查）
   */
  async checkAndHandleReadmeRelevance(owner, repo, issue, readmeContent) {
    if (!readmeContent) {
      return false;
    }

    this.actionService.logReadmeRelevanceCheck(issue.number);
    
    try {
      const isReadmeRelated = await this.analyzer.checkReadmeRelevance(issue, readmeContent);
      
      if (isReadmeRelated) {
        return await this.handleReadmeRelatedIssue(owner, repo, issue, readmeContent);
      }
      
      return false;
    } catch (error) {
      core.warning(`README相关性检测失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 对Issue进行分类并添加标签
   */
  async classifyAndLabelIssue(owner, repo, issue, qualityAnalysis, labelsList) {
    try {
      this.actionService.logClassificationStart(issue.number, labelsList);
      
      // 优先使用提取的用户内容，如果没有则使用原始内容
      const contentForClassification = qualityAnalysis?.contentInfo?.userContent || issue.body || '';
      
      // 使用通用分类服务进行Issue分类
      const classification = await this.classifier.classifyIssue(issue, contentForClassification, labelsList);
      
      return await this.actionService.addClassificationLabel(owner, repo, issue, classification, labelsList);
      
    } catch (aiError) {
      core.error(logMessage(this.config.logging.classification_failed, { error: aiError.message }));
      return false;
    }
  }

  /**
   * 执行Issue的分层检测（新方法）
   */
  async performLayeredDetection(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport) {
    return await this.analyzer.analyzeIssue(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport);
  }

  /**
   * 执行Issue的垃圾检测（保留旧方法以兼容）
   */
  async performSpamDetection(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport) {
    // 使用新的分层检测方法
    const result = await this.performLayeredDetection(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport);
    return result.decision;
  }
}

module.exports = IssueWorkflowService;
