const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

/**
 * 验证配置完整性
 * @param {Object} config 配置对象
 * @throws {Error} 配置不完整时抛出错误
 */
function validateConfig(config) {
  const requiredSections = ['prompts', 'responses', 'logging', 'ai_settings', 'defaults'];
  const requiredPrompts = ['spam_detection', 'readme_coverage_check', 'content_quality_check', 'pr_spam_detection'];
  
  // 检查主要配置段
  for (const section of requiredSections) {
    if (!config[section]) {
      throw new Error(`配置文件缺少必需的段落: ${section}`);
    }
  }
  
  // 检查关键提示词
  for (const prompt of requiredPrompts) {
    if (!config.prompts[prompt]) {
      throw new Error(`配置文件缺少必需的提示词: ${prompt}`);
    }
  }
  
  // 检查AI设置
  if (typeof config.ai_settings.max_tokens !== 'number' || config.ai_settings.max_tokens <= 0) {
    throw new Error('配置文件中的 max_tokens 必须是正整数');
  }
  
  if (typeof config.ai_settings.temperature !== 'number' || config.ai_settings.temperature < 0 || config.ai_settings.temperature > 2) {
    throw new Error('配置文件中的 temperature 必须是 0-2 之间的数字');
  }
  
  core.info('✅ 配置文件验证通过');
}

/**
 * 读取配置文件
 * @returns {Object} 配置对象
 */
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // 验证配置完整性
    validateConfig(config);
    
    return config;
  } catch (error) {
    core.error('无法读取配置文件: ' + error.message);
    throw error;
  }
}

/**
 * 解析用户输入参数
 * @param {Object} config 基础配置对象
 * @returns {Object} 解析后的配置对象
 */
function parseInputs(config) {
  // 获取输入参数，使用配置文件中的默认值
  const token = core.getInput('github-token') || process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const aiModel = core.getInput('ai-model') || process.env.INPUT_AI_MODEL || config.defaults.ai_model;
  const labelsInput = core.getInput('labels') || process.env.INPUT_LABELS || config.defaults.labels;
  const blacklistUsersInput = core.getInput('blacklist') || process.env.INPUT_BLACKLIST || '';
  
  // 获取自定义AI配置参数
  const customBaseUrl = core.getInput('ai-base-url') || process.env.INPUT_AI_BASE_URL || '';
  const customApiKey = core.getInput('ai-api-key') || process.env.INPUT_AI_API_KEY || '';
  
  // 解析黑名单用户列表
  const blacklistUsers = blacklistUsersInput
    ? blacklistUsersInput.split(',').map(user => user.trim().toLowerCase()).filter(user => user.length > 0)
    : [];
  
  // 获取新的配置参数，用户设置则用用户设置的，未设置则使用config中的默认值
  const analyzeFileChanges = core.getInput('analyze-file-changes') || process.env.INPUT_ANALYZE_FILE_CHANGES 
    ? (core.getInput('analyze-file-changes') || process.env.INPUT_ANALYZE_FILE_CHANGES).toLowerCase() === 'true'
    : config.ai_settings.analyze_file_changes;
  
  // 解析分析深度参数，使用配置文件中的设置
  const analysisDepth = core.getInput('max-analysis-depth') || process.env.INPUT_MAX_ANALYSIS_DEPTH || config.defaults.analysis_depth;
  
  // 从配置文件获取分析深度设置
  const depthConfig = config.analysis_depths[analysisDepth.toLowerCase()] || config.analysis_depths.normal;
  const maxFilesToAnalyze = depthConfig.max_files;
  const maxPatchLinesPerFile = depthConfig.max_lines;
  
  // 更新配置对象
  config.ai_settings.analyze_file_changes = analyzeFileChanges;
  config.ai_settings.max_files_to_analyze = maxFilesToAnalyze;
  config.ai_settings.max_patch_lines_per_file = maxPatchLinesPerFile;
  
  // 解析标签列表
  const labelsList = labelsInput.split(',').map(label => label.trim()).filter(label => label.length > 0);

  return {
    token,
    aiModel,
    labelsList,
    blacklistUsers,
    analyzeFileChanges,
    analysisDepth,
    maxFilesToAnalyze,
    maxPatchLinesPerFile,
    customBaseUrl,
    customApiKey,
    config
  };
}

module.exports = {
  loadConfig,
  parseInputs,
  validateConfig
};
