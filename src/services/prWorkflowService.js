const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const IssueAnalyzer = require('./issueAnalyzer');
const ClassificationService = require('./classificationService');
const PrActionService = require('./prActionService');

/**
 * PR工作流服务 - 负责协调各种PR处理流程
 */
class PrWorkflowService {
  constructor(octokit, openai, aiModel, config) {
    this.analyzer = new IssueAnalyzer(openai, aiModel, config);
    this.classifier = new ClassificationService(openai, aiModel, config);
    this.actionService = new PrActionService(octokit, config);
    this.config = config;
  }

  /**
   * 对VALID的PR进行分类并添加标签
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名
   * @param {Object} pr - PR对象
   * @param {Array} labelsList - 可用标签列表
   * @param {string} fileChanges - 文件变更信息
   * @returns {Promise<boolean>} 是否成功添加标签
   */
  async classifyAndLabelPR(owner, repo, pr, labelsList, fileChanges = '') {
    try {
      this.actionService.logClassificationStart(pr.number, labelsList);
      
      // 使用通用分类服务进行PR分类
      const classification = await this.classifier.classifyPR(pr, labelsList, fileChanges);
      
      // 添加分类标签
      return await this.actionService.addClassificationLabel(owner, repo, pr, classification, labelsList);
      
    } catch (aiError) {
      core.error(logMessage(this.config.logging.classification_failed, { error: aiError.message }));
      return false;
    }
  }

  /**
   * 执行PR的分层检测
   */
  async performLayeredDetection(pr, fileChanges = '') {
    return await this.analyzer.analyzePR(pr, fileChanges);
  }
}

module.exports = PrWorkflowService;