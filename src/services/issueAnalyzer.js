const { callAI } = require('./ai');
const ClassificationService = require('./classificationService');

/**
 * Issue分析服务 - 负责各种AI分析任务
 */
class IssueAnalyzer {
  constructor(openai, aiModel, config) {
    this.openai = openai;
    this.aiModel = aiModel;
    this.config = config;
    this.classifier = new ClassificationService(openai, aiModel, config);
  }

  /**
   * 第一步：检测是否为垃圾内容（仅检测明显垃圾信息）
   */
  async detectSpam(issue, templateAnalysisReport) {
    const request = {
      instructions: this.config.prompts.spam_detection,
      input: JSON.stringify({
        type: 'issue',
        title: issue.title,
        body: issue.body || '',
        templateAnalysis: templateAnalysisReport
      })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, '垃圾检测');
  }

  /**
   * 第二步：检查README覆盖情况
   */
  async checkReadmeCoverage(issue, readmeContent, pinnedIssuesContent) {
    if (!readmeContent && !pinnedIssuesContent) {
      return 'NOT_COVERED';
    }

    const request = {
      instructions: this.config.prompts.readme_coverage_check,
      input: JSON.stringify({
        readme: readmeContent || '',
        pinnedIssues: pinnedIssuesContent || '',
        issue: { title: issue.title, body: issue.body || '' }
      })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, 'README覆盖检查');
  }

  /**
   * 第三步：检查内容质量
   */
  async checkContentQuality(issue, templateAnalysisReport) {
    const request = {
      instructions: this.config.prompts.content_quality_check,
      input: JSON.stringify({
        title: issue.title,
        body: issue.body || '',
        templateAnalysis: templateAnalysisReport
      })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, '内容质量检查');
  }

  /**
   * 检查Issue是否与README相关（保留旧方法以兼容）
   */
  async checkReadmeRelevance(issue, readmeContent) {
    if (!readmeContent) {
      return false;
    }

    const request = {
      instructions: this.config.prompts.readme_relevance,
      input: JSON.stringify({
        readme: readmeContent,
        issue: { title: issue.title, body: issue.body || '' }
      })
    };
    
    const decision = await callAI(this.openai, this.aiModel, request, this.config, 'README相关性检测');
    return decision === 'RELATED';
  }

  /**
   * 分层检测Issue（新的主要方法）
   */
  async analyzeIssue(issue, readmeContent, pinnedIssuesContent, templateAnalysisReport) {
    console.log(this.config.logging.spam_check_start);
    
    // 第一步：垃圾检测
    const spamResult = await this.detectSpam(issue, templateAnalysisReport);
    console.log(this.config.logging.spam_check_result.replace('{result}', spamResult));
    
    if (spamResult === 'SPAM') {
      return { decision: 'SPAM', step: 1 };
    }

    // 第二步：README覆盖检查
    console.log(this.config.logging.readme_check_start);
    const coverageResult = await this.checkReadmeCoverage(issue, readmeContent, pinnedIssuesContent);
    console.log(this.config.logging.readme_check_result.replace('{result}', coverageResult));
    
    if (coverageResult === 'COVERED') {
      return { decision: 'README_COVERED', step: 2 };
    }

    // 通过所有检查，需要进行分类
    return { decision: 'KEEP', step: 2 };
  }

  /**
   * 生成基于README的回答
   */
  async generateReadmeAnswer(issue, readmeContent) {
    const request = {
      instructions: this.config.prompts.readme_answer
        .replace('{readme_answer_length}', this.config.locale.readme_answer_length)
        .replace('{answer_language}', this.config.locale.answer_language),
      input: JSON.stringify({
        readme: readmeContent,
        issue: { title: issue.title, body: issue.body || '' }
      })
    };

    return await callAI(this.openai, this.aiModel, request, this.config, 'README回答生成', false);
  }

  /**
   * 为 UNCLEAR 的 Issue 生成智能回答
   * 即使描述不清楚，也尝试结合 README 提供有用信息
   */
  async generateSmartAnswerForUnclear(issue, readmeContent) {
    if (!readmeContent) {
      return null; // 没有 README 内容无法生成智能回答
    }

    const request = {
      instructions: this.config.prompts.unclear_issue_smart_answer
        .replace('{smart_answer_length}', this.config.locale.smart_answer_length)
        .replaceAll('{answer_language}', this.config.locale.answer_language),
      input: JSON.stringify({
        readme: readmeContent,
        issue: { title: issue.title, body: issue.body || '' }
      })
    };
    
    const result = await callAI(this.openai, this.aiModel, request, this.config, 'UNCLEAR智能回答生成', false);
    
    // 解析 AI 响应
    const normalizedResult = result.toUpperCase();
    if (normalizedResult.startsWith('HELPFUL_ANSWER:')) {
      return result.substring('HELPFUL_ANSWER:'.length).trim();
    } else if (normalizedResult === 'NEED_MORE_INFO') {
      return null; // 确实需要更多信息
    }
    
    // 如果响应格式不符合预期，尝试直接使用响应内容
    return result && result.length > 10 ? result : null;
  }

  /**
   * 对Issue进行分类
   */
  async classifyIssue(issue, contentForClassification, labelsList) {
    return await this.classifier.classifyIssue(issue, contentForClassification, labelsList);
  }

  /**
   * 检测PR是否为垃圾内容（第一步）
   */
  async detectPRSpam(pr, fileChanges = '') {
    const request = {
      instructions: this.config.prompts.pr_spam_detection,
      input: JSON.stringify({
        title: pr.title,
        body: pr.body || '',
        fileChanges
      })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, 'PR垃圾检测');
  }

  /**
   * 检测PR提交标题规范性（第二步）
   */
  async checkPRCommitCompliance(pr) {
    const request = {
      instructions: this.config.prompts.pr_commit_check,
      input: JSON.stringify({ title: pr.title })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, 'PR提交规范检查');
  }

  /**
   * 检测PR质量（第三步）
   */
  async checkPRQuality(pr, fileChanges = '') {
    const request = {
      instructions: this.config.prompts.pr_quality_check,
      input: JSON.stringify({
        title: pr.title,
        body: pr.body || '',
        fileChanges
      })
    };
    
    return await callAI(this.openai, this.aiModel, request, this.config, 'PR质量检查');
  }

  /**
   * PR分层检测（新的主要方法）
   */
  async analyzePR(pr, fileChanges = '') {
    console.log(this.config.logging.spam_check_start);
    
    // 第一步：垃圾检测
    const spamResult = await this.detectPRSpam(pr, fileChanges);
    console.log(this.config.logging.spam_check_result.replace('{result}', spamResult));
    
    if (spamResult === 'SPAM') {
      return { decision: 'SPAM', step: 1 };
    }

    // 第二步：提交规范检查
    console.log(this.config.logging.pr_commit_check_start || '第2步：检查提交标题规范');
    const commitResult = await this.checkPRCommitCompliance(pr);
    console.log((this.config.logging.pr_commit_check_result || 'PR提交规范检查结果: {result}').replace('{result}', commitResult));
    
    if (commitResult === 'INVALID') {
      return { decision: 'INVALID_COMMIT', step: 2 };
    }

    // 第三步：PR质量检查
    console.log(this.config.logging.pr_quality_check_start || '第3步：检查PR质量');
    const qualityResult = await this.checkPRQuality(pr, fileChanges);
    console.log((this.config.logging.pr_quality_check_result || 'PR质量检查结果: {result}').replace('{result}', qualityResult));
    
    if (qualityResult === 'UNCLEAR') {
      return { decision: 'UNCLEAR', step: 3 };
    }
    
    if (qualityResult === 'MALICIOUS') {
      return { decision: 'MALICIOUS', step: 3 };
    }
    
    if (qualityResult === 'TRIVIAL') {
      return { decision: 'TRIVIAL', step: 3 };
    }

    // 通过所有检查
    return { decision: 'KEEP', step: 3 };
  }

  /**
   * 统一的内容检测入口（支持Issue和PR）
   */
  async detectContent(content, type = 'issue', additionalData = {}) {
    if (type === 'issue') {
      return await this.analyzeIssue(
        content, 
        additionalData.readmeContent, 
        additionalData.pinnedIssuesContent, 
        additionalData.templateAnalysisReport
      );
    } else if (type === 'pr') {
      return await this.analyzePR(content, additionalData.fileChanges);
    }
    
    throw new Error(`Unsupported content type: ${type}`);
  }
}

module.exports = IssueAnalyzer;
