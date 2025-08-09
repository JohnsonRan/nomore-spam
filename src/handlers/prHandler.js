const core = require('@actions/core');
const { logMessage, handleApiCall } = require('../utils/helpers');
const PrWorkflowService = require('../services/prWorkflowService');
const { closePR } = require('../services/github');

/**
 * 处理新创建的PR
 * @param {Object} octokit GitHub API客户端
 * @param {Object} openai OpenAI客户端
 * @param {Object} context GitHub上下文
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {string} aiModel AI模型名
 * @param {Object} config 配置对象
 * @param {Array} labelsList 标签列表
 * @param {Array} blacklistUsers 黑名单用户列表
 */
async function handleNewPR(octokit, openai, context, owner, repo, aiModel, config, labelsList, blacklistUsers) {
  try {
    const pr = context.payload.pull_request;
    const prTitle = pr.title;
    const prAuthor = pr.user.login.toLowerCase();
    
    core.info(logMessage(config.logging.pr_check_start, { title: prTitle }));
    
    // 检查用户是否在黑名单中
    if (blacklistUsers.includes(prAuthor)) {
      await handleBlacklistedPR(octokit, owner, repo, pr, config);
      return;
    }
    
    // 获取PR的文件变更
    const fileChanges = await analyzeFileChanges(octokit, owner, repo, pr, config);
    
    // 创建工作流服务实例
    const workflowService = new PrWorkflowService(octokit, openai, aiModel, config);
    
    // 进行分层检测
    const analysisResult = await workflowService.performLayeredDetection(pr, fileChanges);
    const decision = analysisResult.decision;
    
    if (decision === 'SPAM') {
      await handleSpamPR(octokit, owner, repo, pr, config);
    } else if (decision === 'INVALID_COMMIT') {
      await handleInvalidCommitPR(octokit, owner, repo, pr, config);
    } else if (decision === 'MALICIOUS' || decision === 'TRIVIAL') {
      await handleLowQualityPR(octokit, owner, repo, pr, config, decision);
    } else if (decision === 'UNCLEAR') {
      // 暂时保持开启，但可以添加评论要求澄清
      core.info(`PR #{${pr.number}} 描述不够清晰，但暂时保持开启`);
      // 对于UNCLEAR的PR也可以尝试分类
      await handleValidPR(workflowService, owner, repo, pr, fileChanges, labelsList);
    } else {
      // KEEP - 有效PR，进行分类并添加标签
      await handleValidPR(workflowService, owner, repo, pr, fileChanges, labelsList);
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.pr_process_error, { error: error.message }));
    throw error;
  }
}

/**
 * 处理有效PR
 */
async function handleValidPR(workflowService, owner, repo, pr, fileChanges, labelsList) {
  core.info(logMessage(workflowService.config.logging.pr_passed_log, { number: pr.number }));
  
  // 对于通过检查的PR，进行分类并添加标签
  if (labelsList && labelsList.length > 0) {
    await workflowService.classifyAndLabelPR(owner, repo, pr, labelsList, fileChanges);
  }
}

/**
 * 通用PR关闭处理函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} pr PR对象
 * @param {Object} config 配置对象
 * @param {string} responseKey 响应消息键名
 * @param {string} logKey 日志消息键名
 */
async function closePRWithType(octokit, owner, repo, pr, config, responseKey, logKey) {
  await closePR(
    octokit, 
    owner, 
    repo, 
    pr.number, 
    config.responses[responseKey],
    config
  );
  
  core.info(logMessage(config.logging[logKey], { number: pr.number }));
}

/**
 * 处理低质量PR（恶意或无意义）
 */
async function handleLowQualityPR(octokit, owner, repo, pr, config, reason) {
  const responseMap = {
    'MALICIOUS': 'pr_malicious',
    'TRIVIAL': 'pr_trivial'
  };
  
  const logMap = {
    'MALICIOUS': 'pr_malicious_log',
    'TRIVIAL': 'pr_trivial_log'
  };
  
  const responseKey = responseMap[reason] || 'pr_closed';
  const logKey = logMap[reason] || 'pr_closed_log';
  
  await closePRWithType(octokit, owner, repo, pr, config, responseKey, logKey);
}

/**
 * 处理黑名单用户的PR
 */
async function handleBlacklistedPR(octokit, owner, repo, pr, config) {
  await closePRWithType(octokit, owner, repo, pr, config, 'pr_closed', 'pr_closed_log');
}

/**
 * 处理不符合Commit规范的PR
 */
async function handleInvalidCommitPR(octokit, owner, repo, pr, config) {
  await closePRWithType(octokit, owner, repo, pr, config, 'pr_invalid_commit', 'pr_commit_rule_log');
}

/**
 * 处理垃圾PR
 */
async function handleSpamPR(octokit, owner, repo, pr, config) {
  await closePRWithType(octokit, owner, repo, pr, config, 'pr_closed', 'pr_closed_log');
}

/**
 * 分析PR的文件变更
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} pr PR对象
 * @param {Object} config 配置对象
 * @returns {Promise<string>} 文件变更描述
 */
async function analyzeFileChanges(octokit, owner, repo, pr, config) {
  if (!config.ai_settings.analyze_file_changes) {
    core.info(config.logging.file_analysis_disabled_info);
    return config.logging.file_analysis_disabled;
  }

  try {
    const filesResponse = await handleApiCall(
      () => octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number
      }),
      config.logging.pr_files_fetch_failed
    );
    
    if (filesResponse.data && filesResponse.data.length > 0) {
      // 使用配置中的限制
      const maxFiles = config.ai_settings.max_files_to_analyze || 5;
      const filesToAnalyze = filesResponse.data.slice(0, maxFiles);
      
      const fileChanges = filesToAnalyze.map(file => {
        let changeInfo = `${file.filename}(${file.status},+${file.additions}/-${file.deletions})`;
        
        // 只包含少量关键变更内容用于垃圾检测
        if (file.patch) {
          const patchLines = file.patch.split('\n');
          const maxPatchLines = config.ai_settings.max_patch_lines_per_file || 5;
          const limitedPatch = patchLines
            .filter(line => line.startsWith('+') || line.startsWith('-'))
            .slice(0, maxPatchLines)
            .join('\n');
          
          if (limitedPatch.trim()) {
            changeInfo += `\n${limitedPatch}`;
            if (patchLines.filter(line => line.startsWith('+') || line.startsWith('-')).length > maxPatchLines) {
              changeInfo += '\n...';
            }
          }
        }
        
        return changeInfo;
      }).join('\n---\n');
      
      let result = fileChanges;
      if (filesResponse.data.length > maxFiles) {
        result += '\n' + logMessage(config.logging.file_changes_truncated, { 
          total: filesResponse.data.length, 
          shown: maxFiles 
        });
      }
      
      core.info(logMessage(config.logging.file_changes_count, { count: filesResponse.data.length }));
      return result;
    } else {
      return config.logging.no_file_changes;
    }
  } catch (error) {
    core.warning(logMessage(config.logging.file_changes_error, { error: error.message }));
    return config.logging.file_changes_unavailable;
  }
}

module.exports = {
  handleNewPR
};
