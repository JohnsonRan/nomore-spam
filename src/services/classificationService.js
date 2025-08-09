const core = require('@actions/core');
const { callAI } = require('./ai');
const { logMessage } = require('../utils/helpers');

/**
 * 通用分类服务 - 负责Issue和PR的分类逻辑
 * 实现统一的分类接口，支持不同类型的内容分类
 */
class ClassificationService {
  constructor(openai, aiModel, config) {
    this.openai = openai;
    this.aiModel = aiModel;
    this.config = config;
  }

  /**
   * 统一的分类方法
   * @param {Object} content - 要分类的内容对象（Issue或PR）
   * @param {string} type - 内容类型：'issue' 或 'pr'
   * @param {string} extractedContent - 提取的用户内容
   * @param {Array} labelsList - 可用标签列表
   * @param {string} fileChanges - PR的文件变更（仅PR需要）
   * @returns {Promise<string>} 分类结果
   */
  async classify(content, type, extractedContent, labelsList, fileChanges = '') {
    try {
      const labelsOptions = labelsList.map(l => l.toUpperCase()).join('、');
      
      let prompt;
      let purpose;
      
      if (type === 'issue') {
        prompt = this.config.prompts.issue_classification
          .replace('{issue_title}', content.title)
          .replace('{user_content}', extractedContent)
          .replace('{labels_options}', labelsOptions);
        purpose = 'Issue分类';
      } else if (type === 'pr') {
        prompt = this.config.prompts.pr_classification
          .replace('{pr_title}', content.title)
          .replace('{pr_body}', content.body || '')
          .replace('{file_changes}', fileChanges)
          .replace('{labels_options}', labelsOptions);
        purpose = 'PR分类';
      } else {
        throw new Error(`不支持的分类类型: ${type}`);
      }
      
      const classification = await callAI(this.openai, this.aiModel, prompt, this.config, purpose);
      
      core.info(logMessage(this.config.logging.ai_call_result, { 
        purpose, 
        result: classification 
      }));
      
      return classification;
      
    } catch (error) {
      core.error(logMessage(this.config.logging.ai_call_failed, { 
        purpose: `${type}分类`, 
        error: error.message 
      }));
      throw error;
    }
  }

  /**
   * Issue分类的便捷方法
   * @param {Object} issue - Issue对象
   * @param {string} extractedContent - 提取的用户内容
   * @param {Array} labelsList - 可用标签列表
   * @returns {Promise<string>} 分类结果
   */
  async classifyIssue(issue, extractedContent, labelsList) {
    return await this.classify(issue, 'issue', extractedContent, labelsList);
  }

  /**
   * PR分类的便捷方法
   * @param {Object} pr - PR对象
   * @param {Array} labelsList - 可用标签列表
   * @param {string} fileChanges - 文件变更信息
   * @returns {Promise<string>} 分类结果
   */
  async classifyPR(pr, labelsList, fileChanges = '') {
    // 对于PR，直接使用body作为内容
    const extractedContent = pr.body || '';
    return await this.classify(pr, 'pr', extractedContent, labelsList, fileChanges);
  }

  /**
   * 验证分类结果是否匹配预设标签
   * @param {string} classification - AI返回的分类结果
   * @param {Array} labelsList - 可用标签列表
   * @returns {string|null} 匹配的标签或null
   */
  validateClassification(classification, labelsList) {
    if (!classification) {
      return null;
    }

    // 尝试精确匹配
    for (const label of labelsList) {
      if (label.toLowerCase() === classification.toLowerCase()) {
        return label;
      }
    }

    // 尝试包含匹配
    for (const label of labelsList) {
      if (classification.toLowerCase().includes(label.toLowerCase()) || 
          label.toLowerCase().includes(classification.toLowerCase())) {
        return label;
      }
    }

    // 特殊匹配规则
    const classificationLower = classification.toLowerCase();
    
    // ENHANCEMENT 和 FEATURE 的别名匹配
    if ((classificationLower.includes('enhancement') || 
         classificationLower.includes('feature') || 
         classificationLower.includes('improve')) && 
        (labelsList.some(l => l.toLowerCase().includes('enhancement')) ||
         labelsList.some(l => l.toLowerCase().includes('feature')))) {
      return labelsList.find(l => 
        l.toLowerCase().includes('enhancement') || 
        l.toLowerCase().includes('feature')
      );
    }

    // BUG 的别名匹配
    if ((classificationLower.includes('bug') || 
         classificationLower.includes('fix') || 
         classificationLower.includes('error')) && 
        labelsList.some(l => l.toLowerCase().includes('bug'))) {
      return labelsList.find(l => l.toLowerCase().includes('bug'));
    }

    // DOCUMENTATION 的别名匹配
    if ((classificationLower.includes('doc') || 
         classificationLower.includes('readme')) && 
        labelsList.some(l => l.toLowerCase().includes('doc'))) {
      return labelsList.find(l => l.toLowerCase().includes('doc'));
    }

    // QUESTION 的别名匹配
    if ((classificationLower.includes('question') || 
         classificationLower.includes('help')) && 
        labelsList.some(l => l.toLowerCase().includes('question'))) {
      return labelsList.find(l => l.toLowerCase().includes('question'));
    }

    return null;
  }
}

module.exports = ClassificationService;
