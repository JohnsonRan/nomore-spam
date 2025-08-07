const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { addLabels, addComment, closeIssue } = require('./github');

/**
 * Issue操作服务 - 负责执行具体的Issue操作
 */
class IssueActionService {
  constructor(octokit, config) {
    this.octokit = octokit;
    this.config = config;
  }

  /**
   * 添加README回答评论
   */
  async addReadmeAnswer(owner, repo, issueNumber, readmeAnswer) {
    const fullAnswer = this.config.responses.readme_answer_prefix + readmeAnswer;
    
    await addComment(
      this.octokit, 
      owner, 
      repo, 
      issueNumber, 
      fullAnswer,
      this.config.logging.readme_answer_failed
    );
    
    core.info(logMessage(this.config.logging.readme_answer_generated, { number: issueNumber }));
  }

  /**
   * 为Issue添加分类标签
   */
  async addClassificationLabel(owner, repo, issue, classification, labelsList) {
    const matchedLabel = labelsList.find(label => 
      classification.toUpperCase() === label.toUpperCase()
    );
    
    if (matchedLabel) {
      try {
        await addLabels(
          this.octokit, 
          owner, 
          repo, 
          issue.number, 
          [matchedLabel],
          this.config.logging.label_add_api_failed
        );
        core.info(logMessage(this.config.logging.label_added, { 
          number: issue.number, 
          label: matchedLabel 
        }));
        return true;
      } catch (labelError) {
        core.warning(logMessage(this.config.logging.label_add_failed, { 
          error: labelError.message 
        }));
        return false;
      }
    } else {
      core.info(logMessage(this.config.logging.label_no_match, { 
        number: issue.number, 
        classification 
      }));
      return false;
    }
  }

  /**
   * 关闭README相关的Issue（不锁定）
   */
  async closeReadmeCoveredIssue(owner, repo, issue) {
    await closeIssue(
      this.octokit, 
      owner, 
      repo, 
      issue.number, 
      this.config.responses.issue_readme_covered,
      this.config,
      false  // 不锁定，允许继续讨论
    );
    
    core.info(logMessage(this.config.logging.issue_readme_covered_log, { number: issue.number }));
  }

  /**
   * 记录相关性检查日志
   */
  logReadmeRelevanceCheck(issueNumber) {
    core.info(logMessage(this.config.logging.readme_relevance_check, { number: issueNumber }));
  }

  /**
   * 记录分类开始日志
   */
  logClassificationStart(issueNumber, labelsList) {
    core.info(logMessage(this.config.logging.classification_start, { number: issueNumber }));
    core.info(logMessage(this.config.logging.available_labels, { labels: labelsList.join(', ') }));
  }
}

module.exports = IssueActionService;
