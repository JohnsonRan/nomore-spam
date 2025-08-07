const core = require('@actions/core');
const { logMessage, handleApiCall, isValidCommitTitle } = require('../utils/helpers');
const { callAI } = require('../services/ai');
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
 * @param {Array} blacklistUsers 黑名单用户列表
 */
async function handleNewPR(octokit, openai, context, owner, repo, aiModel, config, blacklistUsers) {
  try {
    const pr = context.payload.pull_request;
    const prTitle = pr.title;
    const prBody = pr.body || '';
    const prAuthor = pr.user.login.toLowerCase();
    
    core.info(logMessage(config.logging.pr_check_start, { title: prTitle }));
    
    // 检查PR标题是否符合Commit规范
    if (!isValidCommitTitle(prTitle)) {
      await handleInvalidCommitPR(octokit, owner, repo, pr, config);
      return;
    }
    
    // 检查用户是否在黑名单中
    if (blacklistUsers.includes(prAuthor)) {
      await handleBlacklistedPR(octokit, owner, repo, pr, config);
      return;
    }
    
    // 获取PR的文件变更
    const fileChanges = await analyzeFileChanges(octokit, owner, repo, pr, config);
    
    // 构建AI检查提示
    const prompt = config.prompts.pr_detection
      .replace('{pr_title}', prTitle)
      .replace('{pr_body}', prBody)
      .replace('{file_changes}', fileChanges);
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'PR垃圾检测');
    
    if (decision === 'CLOSE') {
      await handleSpamPR(octokit, owner, repo, pr, config);
    } else {
      core.info(logMessage(config.logging.pr_passed_log, { number: pr.number }));
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.pr_process_error, { error: error.message }));
    throw error;
  }
}

/**
 * 处理黑名单用户的PR
 */
async function handleBlacklistedPR(octokit, owner, repo, pr, config) {
  await closePR(
    octokit, 
    owner, 
    repo, 
    pr.number, 
    config.responses.pr_closed,
    config
  );
  
  core.info(logMessage(config.logging.pr_closed_log, { number: pr.number }));
}

/**
 * 处理不符合Commit规范的PR
 */
async function handleInvalidCommitPR(octokit, owner, repo, pr, config) {
  await closePR(
    octokit, 
    owner, 
    repo, 
    pr.number, 
    config.responses.pr_closed,
    config
  );
  
  core.info(logMessage(config.logging.pr_commit_rule_log, { number: pr.number }));
}

/**
 * 处理垃圾PR
 */
async function handleSpamPR(octokit, owner, repo, pr, config) {
  await closePR(
    octokit, 
    owner, 
    repo, 
    pr.number, 
    config.responses.pr_closed,
    config
  );
  
  core.info(logMessage(config.logging.pr_closed_log, { number: pr.number }));
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
