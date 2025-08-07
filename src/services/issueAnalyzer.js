const { callAI } = require('./ai');

/**
 * Issue分析服务 - 负责各种AI分析任务
 */
class IssueAnalyzer {
  constructor(openai, aiModel, config) {
    this.openai = openai;
    this.aiModel = aiModel;
    this.config = config;
  }

  /**
   * 检测Issue是否为垃圾内容
   */
  async detectSpam(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport) {
    const prompt = this.config.prompts.issue_detection
      .replace('{readme_content}', readmeContent || '')
      .replace('{pinned_issues_content}', pinnedIssuesContent || '')
      .replace('{issue_title}', issue.title)
      .replace('{issue_body}', issue.body || '')
      .replace('{template_analysis}', templateAnalysisReport);
    
    return await callAI(this.openai, this.aiModel, prompt, this.config, 'Issue检测');
  }

  /**
   * 检查Issue是否与README相关
   */
  async checkReadmeRelevance(issue, readmeContent) {
    if (!readmeContent) {
      return false;
    }

    const relevancePrompt = this.config.prompts.readme_relevance
      .replace('{readme_content}', readmeContent)
      .replace('{issue_title}', issue.title)
      .replace('{issue_body}', issue.body || '');
    
    const decision = await callAI(this.openai, this.aiModel, relevancePrompt, this.config, 'README相关性检测');
    return decision === 'RELATED';
  }

  /**
   * 生成基于README的回答
   */
  async generateReadmeAnswer(issue, readmeContent) {
    const answerPrompt = this.config.prompts.readme_answer
      .replace('{readme_content}', readmeContent)
      .replace('{issue_title}', issue.title)
      .replace('{issue_body}', issue.body || '');
    
    return await callAI(this.openai, this.aiModel, answerPrompt, this.config, 'README回答生成');
  }

  /**
   * 对Issue进行分类
   */
  async classifyIssue(issue, contentForClassification, labelsList) {
    const labelsOptions = labelsList.map(l => l.toUpperCase()).join('、');
    
    const classificationPrompt = this.config.prompts.issue_classification
      .replace('{issue_title}', issue.title)
      .replace('{user_content}', contentForClassification)
      .replace('{labels_options}', labelsOptions);
    
    return await callAI(this.openai, this.aiModel, classificationPrompt, this.config, 'Issue分类');
  }
}

module.exports = IssueAnalyzer;
