/**
 * Issue模板检测和内容解析模块
 * 用于识别GitHub Issue模板并提取用户实际填写的内容
 */

/**
 * 常见的模板关键词和模式
 */
const TEMPLATE_PATTERNS = {
  // 标题模式
  TITLE_PREFIXES: ['[BUG]', '[FEATURE]', '[Feature Request]', '[Bug Report]', '[ENHANCEMENT]', '[QUESTION]'],
  
  // 模板标识
  TEMPLATE_INDICATORS: [
    /### .*/,  // Markdown标题
    /## .*/,   // Markdown标题
    /\*\*.+\*\*/,  // 粗体标题
    /\*\*(.+)\*\*/,  // 粗体内容
    /<!--.+-->/,   // HTML注释
    /^\s*-\s*\[[\sx]\]/,  // 复选框
    /^>\s*.+/,     // 引用块
    /\|\s*.+\s*\|/,  // 表格
  ],
  
  // 常见模板字段
  COMMON_FIELDS: [
    'description', 'expected behavior', 'actual behavior', 'steps to reproduce',
    'environment', 'version', 'browser', 'additional context', 'screenshots',
    '描述', '预期行为', '实际行为', '复现步骤', '环境信息', '版本', '浏览器',
    '附加信息', '截图', 'bug描述', '功能描述', '如何实现', '自查', '确认'
  ],
  
  // 空内容模式
  EMPTY_PATTERNS: [
    /^_No response_$/i,
    /^N\/A$/i,
    /^None$/i,
    /^无$/,
    /^没有$/,
    /^暂无$/,
    /^\s*$/, // 空白
    /^\.+$/, // 只有点
    /^-+$/, // 只有横线
    /^#+$/, // 只有井号
  ]
};

/**
 * 检测Issue是否使用了模板
 * @param {string} issueTitle Issue标题
 * @param {string} issueBody Issue内容
 * @returns {Object} 检测结果
 */
function detectTemplate(issueTitle, issueBody) {
  const result = {
    hasTemplate: false,
    templateType: null,
    confidence: 0,
    indicators: []
  };

  if (!issueBody) {
    return result;
  }

  let indicatorCount = 0;
  const totalLines = issueBody.split('\n').length;

  // 检查标题是否有模板前缀
  for (const prefix of TEMPLATE_PATTERNS.TITLE_PREFIXES) {
    if (issueTitle.includes(prefix)) {
      result.indicators.push(`Title prefix: ${prefix}`);
      indicatorCount += 2; // 标题前缀权重更高
      break;
    }
  }

  // 检查内容中的模板模式
  for (const pattern of TEMPLATE_PATTERNS.TEMPLATE_INDICATORS) {
    const matches = issueBody.match(new RegExp(pattern, 'gm'));
    if (matches && matches.length > 0) {
      result.indicators.push(`Template pattern: ${pattern.source} (${matches.length}x)`);
      indicatorCount += matches.length;
    }
  }

  // 检查常见字段
  let fieldCount = 0;
  for (const field of TEMPLATE_PATTERNS.COMMON_FIELDS) {
    const regex = new RegExp(field, 'gi');
    if (regex.test(issueBody)) {
      fieldCount++;
    }
  }
  
  if (fieldCount >= 2) {
    result.indicators.push(`Found ${fieldCount} template fields`);
    indicatorCount += fieldCount;
  }

  // 计算置信度
  result.confidence = Math.min(100, (indicatorCount / Math.max(totalLines / 5, 1)) * 100);
  result.hasTemplate = result.confidence > 30; // 30%以上置信度认为使用了模板

  // 判断模板类型
  if (result.hasTemplate) {
    if (issueTitle.toLowerCase().includes('bug') || issueBody.toLowerCase().includes('bug')) {
      result.templateType = 'bug_report';
    } else if (issueTitle.toLowerCase().includes('feature') || issueBody.toLowerCase().includes('feature')) {
      result.templateType = 'feature_request';
    } else {
      result.templateType = 'generic';
    }
  }

  return result;
}

/**
 * 从模板化的Issue中提取用户实际填写的内容
 * @param {string} issueBody Issue内容
 * @param {Object} templateInfo 模板检测信息
 * @returns {Object} 提取的内容
 */
function extractUserContent(issueBody, templateInfo) {
  if (!issueBody || !templateInfo.hasTemplate) {
    return {
      userContent: issueBody || '',
      isEmpty: !issueBody || issueBody.trim().length === 0,
      extractedSections: []
    };
  }

  const sections = [];
  const lines = issueBody.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查是否是标题行
    const isHeader = TEMPLATE_PATTERNS.TEMPLATE_INDICATORS.some(pattern => 
      pattern.test(line)
    );

    if (isHeader) {
      // 保存之前的section
      if (currentSection && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content && !isEmptyContent(content)) {
          sections.push({
            title: currentSection,
            content: content,
            lineStart: i - currentContent.length,
            lineEnd: i - 1
          });
        }
      }
      
      // 开始新的section
      currentSection = line.replace(/[#*>]/g, '').trim();
      currentContent = [];
    } else {
      // 添加到当前section
      currentContent.push(line);
    }
  }

  // 处理最后一个section
  if (currentSection && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content && !isEmptyContent(content)) {
      sections.push({
        title: currentSection,
        content: content,
        lineStart: lines.length - currentContent.length,
        lineEnd: lines.length - 1
      });
    }
  }

  // 提取所有用户内容
  const userContentParts = sections
    .filter(section => section.content && !isEmptyContent(section.content))
    .map(section => `${section.title}: ${section.content}`);

  const userContent = userContentParts.join('\n\n');
  
  return {
    userContent: userContent,
    isEmpty: userContentParts.length === 0,
    extractedSections: sections,
    totalSections: sections.length,
    validSections: userContentParts.length
  };
}

/**
 * 检查内容是否为空或无效
 * @param {string} content 内容
 * @returns {boolean} 是否为空
 */
function isEmptyContent(content) {
  if (!content || content.trim().length === 0) {
    return true;
  }

  // 检查是否匹配空内容模式
  for (const pattern of TEMPLATE_PATTERNS.EMPTY_PATTERNS) {
    if (pattern.test(content.trim())) {
      return true;
    }
  }

  // 检查是否只包含模板占位符
  const cleanContent = content
    .replace(/[-_*#>\s]/g, '') // 移除常见标记符号
    .replace(/\[[\sx]\]/g, '') // 移除复选框
    .replace(/\|/g, ''); // 移除表格分隔符

  return cleanContent.length < 3; // 少于3个有效字符认为是空内容
}

/**
 * 生成模板分析报告
 * @param {Object} templateInfo 模板检测信息
 * @param {Object} contentInfo 内容提取信息
 * @returns {string} 分析报告
 */
function generateAnalysisReport(templateInfo, contentInfo) {
  const report = [];
  
  report.push('Template Analysis:');
  report.push(`- Has template: ${templateInfo.hasTemplate ? 'Yes' : 'No'}`);
  
  if (templateInfo.hasTemplate) {
    report.push(`- Type: ${templateInfo.templateType}`);
    report.push(`- Confidence: ${templateInfo.confidence.toFixed(1)}%`);
    report.push(`- Indicators: ${templateInfo.indicators.join(', ')}`);
    report.push(`- Valid sections: ${contentInfo.validSections}/${contentInfo.totalSections}`);
    report.push(`- Content: ${contentInfo.isEmpty ? 'Empty' : 'Has content'}`);
  }

  return report.join('\n');
}

/**
 * 智能分析Issue内容质量
 * @param {string} issueTitle Issue标题  
 * @param {string} issueBody Issue内容
 * @returns {Object} 分析结果
 */
function analyzeIssueQuality(issueTitle, issueBody) {
  const templateInfo = detectTemplate(issueTitle, issueBody);
  const contentInfo = extractUserContent(issueBody, templateInfo);
  
  const analysis = {
    templateInfo,
    contentInfo,
    quality: {
      score: 0,
      level: 'unknown', // low, medium, high
      reasons: []
    }
  };

  // 质量评分逻辑
  let score = 50; // 基础分

    // 标题质量
  if (issueTitle && issueTitle.trim().length > 10) {
    score += 15;
    analysis.quality.reasons.push('Good title length');
  } else {
    score -= 10;
    analysis.quality.reasons.push('Title too short');
  }

  // 内容质量
  if (templateInfo.hasTemplate) {
    // 使用了模板
    if (!contentInfo.isEmpty && contentInfo.validSections >= 2) {
      score += 25;
      analysis.quality.reasons.push('Template used and well filled');
    } else if (!contentInfo.isEmpty) {
      score += 10;
      analysis.quality.reasons.push('Template used but incomplete');
    } else {
      score -= 20;
      analysis.quality.reasons.push('Template used but empty');
    }
  } else {
    // 没有使用模板
    if (issueBody && issueBody.trim().length > 50) {
      score += 20;
      analysis.quality.reasons.push('Good free-form description');
    } else if (issueBody && issueBody.trim().length > 10) {
      score += 5;
      analysis.quality.reasons.push('Brief free-form description');
    } else {
      score -= 25;
      analysis.quality.reasons.push('Too short or empty content');
    }
  }

  // 最终评分
  analysis.quality.score = Math.max(0, Math.min(100, score));
  
  if (analysis.quality.score >= 70) {
    analysis.quality.level = 'high';
  } else if (analysis.quality.score >= 40) {
    analysis.quality.level = 'medium';
  } else {
    analysis.quality.level = 'low';
  }

  return analysis;
}

module.exports = {
  detectTemplate,
  extractUserContent,
  isEmptyContent,
  generateAnalysisReport,
  analyzeIssueQuality,
  TEMPLATE_PATTERNS
};
