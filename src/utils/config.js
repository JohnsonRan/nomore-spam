const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

/**
 * 读取配置文件
 * @returns {Object} 配置对象
 */
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
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
  const blacklistUsersInput = core.getInput('blacklist') || process.env.INPUT_BLACKLIST_USERS || process.env.BLACKLIST_USERS || '';
  
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
    config
  };
}

module.exports = {
  loadConfig,
  parseInputs
};
