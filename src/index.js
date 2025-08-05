const core = require('@actions/core');
const github = require('@actions/github');
const OpenAI = require('openai');

const { loadConfig, parseInputs } = require('./utils/config');
const { logMessage } = require('./utils/helpers');
const { handleNewIssue } = require('./handlers/issueHandler');
const { handleNewPR } = require('./handlers/prHandler');

/**
 * 主程序入口
 */
async function run() {
  try {
    // 加载配置文件
    const baseConfig = loadConfig();
    
    // 解析输入参数
    const {
      token,
      aiModel,
      labelsList,
      blacklistUsers,
      analyzeFileChanges,
      analysisDepth,
      maxFilesToAnalyze,
      maxPatchLinesPerFile,
      config
    } = parseInputs(baseConfig);
    
    // 初始化GitHub客户端
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // 初始化OpenAI客户端
    const openai = new OpenAI({
      baseURL: config.defaults.api_base_url,
      apiKey: token
    });
    
    // 输出配置信息
    core.info('API Base URL: ' + config.defaults.api_base_url);
    core.info(logMessage(config.logging.using_ai_model, { model: aiModel }));
    core.info(config.logging.config_info);
    core.info(logMessage(config.logging.analysis_depth_info, { analyze_changes: analyzeFileChanges }));
    core.info(logMessage(config.logging.analysis_depth_details, { 
      depth: analysisDepth, 
      files: maxFilesToAnalyze, 
      lines: maxPatchLinesPerFile 
    }));

    // 获取仓库信息
    const { owner, repo } = context.repo;
    
    // 根据事件类型处理
    if (context.eventName === 'issues' && context.payload.action === 'opened') {
      await handleNewIssue(octokit, openai, context, owner, repo, aiModel, config, labelsList, blacklistUsers);
    } else if (context.eventName === 'pull_request' && context.payload.action === 'opened') {
      await handleNewPR(octokit, openai, context, owner, repo, aiModel, config, blacklistUsers);
    } else {
      core.info(config.logging.event_no_match);
    }
    
  } catch (error) {
    core.setFailed(error.message);
  }
}

// 如果直接运行此文件则执行主程序
if (require.main === module) {
  run();
}

module.exports = { run };
