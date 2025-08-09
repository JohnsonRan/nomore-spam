const core = require('@actions/core');
const { logMessage, handleApiCall } = require('../utils/helpers');
const ClassificationService = require('./classificationService');

/**
 * PR动作服务 - 负责执行PR相关的GitHub API操作
 */
class PrActionService {
  constructor(octokit, config) {
    this.octokit = octokit;
    this.config = config;
    this.classifier = new ClassificationService(null, null, config); // 仅用于验证
  }

  /**
   * 记录分类开始信息
   */
  logClassificationStart(prNumber, labelsList) {
    core.info(logMessage(this.config.logging.classification_start, { number: prNumber }));
    core.info(logMessage(this.config.logging.available_labels, { labels: labelsList.join(', ') }));
  }

  /**
   * 为PR添加分类标签
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名
   * @param {Object} pr - PR对象
   * @param {string} classification - AI分类结果
   * @param {Array} labelsList - 可用标签列表
   * @returns {Promise<boolean>} 是否成功添加标签
   */
  async addClassificationLabel(owner, repo, pr, classification, labelsList) {
    try {
      // 验证分类结果
      const matchedLabel = this.classifier.validateClassification(classification, labelsList);
      
      if (matchedLabel) {
        await this.addLabel(owner, repo, pr.number, matchedLabel);
        core.info(logMessage(this.config.logging.label_added, { 
          number: pr.number, 
          label: matchedLabel 
        }));
        return true;
      } else {
        core.warning(logMessage(this.config.logging.pr_label_no_match, { 
          number: pr.number, 
          classification 
        }));
        return false;
      }
    } catch (error) {
      core.error(logMessage(this.config.logging.classification_process_error, { error: error.message }));
      return false;
    }
  }

  /**
   * 添加标签到PR
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名
   * @param {number} prNumber - PR编号
   * @param {string} label - 标签名
   */
  async addLabel(owner, repo, prNumber, label) {
    try {
      await handleApiCall(
        () => this.octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: prNumber,
          labels: [label]
        }),
        this.config.logging.label_add_api_failed
      );
    } catch (error) {
      core.error(logMessage(this.config.logging.label_add_failed, { error: error.message }));
      throw error;
    }
  }

  /**
   * 添加评论到PR
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名
   * @param {number} prNumber - PR编号
   * @param {string} body - 评论内容
   * @param {string} errorLogKey - 错误日志键名
   */
  async addComment(owner, repo, prNumber, body, errorLogKey) {
    try {
      await handleApiCall(
        () => this.octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body
        }),
        errorLogKey
      );
    } catch (error) {
      core.error(logMessage(this.config.logging[errorLogKey] || errorLogKey, { error: error.message }));
      throw error;
    }
  }
}

module.exports = PrActionService;