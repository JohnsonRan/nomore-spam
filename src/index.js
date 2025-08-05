const core = require('@actions/core');
const github = require('@actions/github');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// 读取配置文件
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    core.error('无法读取配置文件: ' + error.message);
    throw error;
  }
}

// 通用错误处理包装函数
async function handleApiCall(operation, errorMessage) {
  try {
    return await operation();
  } catch (error) {
    core.warning(`${errorMessage}: ${error.message}`);
    throw error;
  }
}

// 日志消息模板处理函数
function logMessage(template, replacements = {}) {
  let message = template;
  for (const [key, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return message;
}

// 统一的AI API调用函数
async function callAI(openai, aiModel, prompt, config, purpose = 'AI调用') {
  try {
    core.info(logMessage(config.logging.ai_call_start, { purpose, model: aiModel }));
    
    const response = await openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.ai_settings.max_tokens,
      temperature: config.ai_settings.temperature
    });
    
    const result = response.choices[0].message.content.trim().toUpperCase();
    core.info(logMessage(config.logging.ai_call_result, { purpose, result }));
    return result;
    
  } catch (aiError) {
    core.error(logMessage(config.logging.ai_call_failed, { purpose, error: aiError.message }));
    if (aiError.response) {
      core.error(logMessage(config.logging.ai_status_code, { code: aiError.response.status }));
      core.error(logMessage(config.logging.ai_response_body, { body: JSON.stringify(aiError.response.data) }));
    }
    throw aiError;
  }
}

async function run() {
  try {
    // 加载配置文件
    const config = loadConfig();
    
    // 获取输入参数，使用配置文件中的默认值
    const token = core.getInput('github-token') || process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const aiModel = core.getInput('ai-model') || process.env.INPUT_AI_MODEL || config.defaults.ai_model;
    const labelsInput = core.getInput('labels') || process.env.INPUT_LABELS || config.defaults.labels;
    
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
    
    // 初始化GitHub客户端
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // 初始化OpenAI客户端
    const openai = new OpenAI({
      baseURL: config.defaults.api_base_url,
      apiKey: token
    });
    
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
      await handleNewIssue(octokit, openai, context, owner, repo, aiModel, config, labelsList);
    } else if (context.eventName === 'pull_request' && context.payload.action === 'opened') {
      await handleNewPR(octokit, openai, context, owner, repo, aiModel, config);
    } else {
      core.info(config.logging.event_no_match);
    }
    
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function handleNewIssue(octokit, openai, context, owner, repo, aiModel, config, labelsList) {
  try {
    const issue = context.payload.issue;
    const issueTitle = issue.title;
    const issueBody = issue.body || '';
    
    core.info(logMessage(config.logging.issue_check_start, { title: issueTitle }));
    core.info(logMessage(config.logging.target_repo, { owner, repo }));
    
    // 获取README.md内容
    let readmeContent = '';
    try {
      const readmeResponse = await handleApiCall(
        () => octokit.rest.repos.getContent({
          owner,
          repo,
          path: 'README.md'
        }),
        config.logging.readme_fetch_failed
      );
      
      if (readmeResponse.data.content) {
        readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf8');
        core.info(config.logging.readme_found);
      }
    } catch (error) {
      core.warning(config.logging.readme_not_found);
    }
    
    // 构建AI检查提示
    const prompt = config.prompts.issue_detection
      .replace('{readme_content}', readmeContent)
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody);
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'Issue垃圾检测');
    
    if (decision === 'CLOSE') {
      // 构建README链接
      const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
      
      // 添加评论说明关闭原因
      await handleApiCall(
        () => octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issue.number,
          body: config.responses.issue_closed.replace('{readme_url}', readmeUrl)
        }),
        config.logging.issue_comment_failed
      );
      
      // 关闭Issue
      await handleApiCall(
        () => octokit.rest.issues.update({
          owner,
          repo,
          issue_number: issue.number,
          state: 'closed'
        }),
        config.logging.issue_close_failed
      );
      
      // 锁定Issue
      await handleApiCall(
        () => octokit.rest.issues.lock({
          owner,
          repo,
          issue_number: issue.number,
          lock_reason: config.defaults.lock_reason
        }),
        config.logging.issue_lock_failed
      );
      
      core.info(logMessage(config.logging.issue_closed_log, { number: issue.number }));
    } else {
      core.info(logMessage(config.logging.issue_passed_log, { number: issue.number }));
      
      // 对于通过检查的Issue，进行分类并添加标签
      await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.issue_process_error, { error: error.message }));
    throw error;
  }
}

async function classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList) {
  try {
    core.info(logMessage(config.logging.classification_start, { number: issue.number }));
    core.info(logMessage(config.logging.available_labels, { labels: labelsList.join(', ') }));
    
    // 使用配置文件中的分类提示模板
    const labelsOptions = labelsList.map(l => l.toUpperCase()).join('、');
    
    const classificationPrompt = config.prompts.issue_classification
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody)
      .replace('{labels_options}', labelsOptions);
    
    // 调用AI进行分类
    let classification;
    try {
      classification = await callAI(openai, aiModel, classificationPrompt, config, 'Issue分类');
    } catch (aiError) {
      core.error(logMessage(config.logging.classification_failed, { error: aiError.message }));
      return;
    }
    
    // 查找匹配的标签
    const matchedLabel = labelsList.find(label => 
      classification.toUpperCase() === label.toUpperCase()
    );
    
    if (matchedLabel) {
      try {
        await handleApiCall(
          () => octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: issue.number,
            labels: [matchedLabel]
          }),
          config.logging.label_add_api_failed
        );
        core.info(logMessage(config.logging.label_added, { number: issue.number, label: matchedLabel }));
      } catch (labelError) {
        core.warning(logMessage(config.logging.label_add_failed, { error: labelError.message }));
      }
    } else {
      core.info(logMessage(config.logging.label_no_match, { number: issue.number, classification }));
    }
    
  } catch (error) {
    core.warning(logMessage(config.logging.classification_process_error, { error: error.message }));
  }
}

async function handleNewPR(octokit, openai, context, owner, repo, aiModel, config) {
  try {
    const pr = context.payload.pull_request;
    const prTitle = pr.title;
    const prBody = pr.body || '';
    
    core.info(logMessage(config.logging.pr_check_start, { title: prTitle }));
    
    // 获取PR的文件变更
    let fileChanges = '';
    if (config.ai_settings.analyze_file_changes) {
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
          
          fileChanges = filesToAnalyze.map(file => {
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
          
          if (filesResponse.data.length > maxFiles) {
            fileChanges += '\n' + logMessage(config.logging.file_changes_truncated, { 
              total: filesResponse.data.length, 
              shown: maxFiles 
            });
          }
          
          core.info(logMessage(config.logging.file_changes_count, { count: filesResponse.data.length }));
        } else {
          fileChanges = config.logging.no_file_changes;
        }
      } catch (error) {
        core.warning(logMessage(config.logging.file_changes_error, { error: error.message }));
        fileChanges = config.logging.file_changes_unavailable;
      }
    } else {
      fileChanges = config.logging.file_analysis_disabled;
      core.info(config.logging.file_analysis_disabled_info);
    }
    
    // 构建AI检查提示
    const prompt = config.prompts.pr_detection
      .replace('{pr_title}', prTitle)
      .replace('{pr_body}', prBody)
      .replace('{file_changes}', fileChanges);
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'PR垃圾检测');
    
    if (decision === 'CLOSE') {
      // 添加评论说明关闭原因
      await handleApiCall(
        () => octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body: config.responses.pr_closed
        }),
        config.logging.pr_comment_failed
      );
      
      // 关闭PR
      await handleApiCall(
        () => octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr.number,
          state: 'closed'
        }),
        config.logging.pr_close_failed
      );
      
      core.info(logMessage(config.logging.pr_closed_log, { number: pr.number }));
    } else {
      core.info(logMessage(config.logging.pr_passed_log, { number: pr.number }));
    }
    
  } catch (error) {
    core.error(logMessage(config.logging.pr_process_error, { error: error.message }));
    throw error;
  }
}

run();