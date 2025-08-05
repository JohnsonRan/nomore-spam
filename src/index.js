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

async function run() {
  try {
    // 加载配置文件
    const config = loadConfig();
    
    // 获取输入参数
    const token = core.getInput('github-token') || process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const aiModel = core.getInput('ai-model') || process.env.INPUT_AI_MODEL || 'openai/gpt-4o';
    
    // 初始化GitHub客户端
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // 初始化OpenAI客户端
    const openai = new OpenAI({
      baseURL: 'https://models.github.ai/inference',
      apiKey: token
    });

    // 获取仓库信息
    const { owner, repo } = context.repo;
    
    // 根据事件类型处理
    if (context.eventName === 'issues' && context.payload.action === 'opened') {
      await handleNewIssue(octokit, openai, context, owner, repo, aiModel, config);
    } else if (context.eventName === 'pull_request' && context.payload.action === 'opened') {
      await handleNewPR(octokit, openai, context, owner, repo, aiModel, config);
    } else {
      core.info('事件类型不匹配，跳过处理');
    }
    
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function handleNewIssue(octokit, openai, context, owner, repo, aiModel, config) {
  try {
    const issue = context.payload.issue;
    const issueTitle = issue.title;
    const issueBody = issue.body || '';
    
    core.info('检查Issue: ' + issueTitle);
    core.info('目标仓库: ' + owner + '/' + repo);
    
    // 获取README.md内容
    let readmeContent = '';
    try {
      const readmeResponse = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'README.md'
      });
      
      if (readmeResponse.data.content) {
        readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf8');
        core.info('成功获取README.md文件');
      }
    } catch (error) {
      core.warning('未找到README.md文件，将跳过重复内容检查');
    }
    
    // 构建AI检查提示
    const prompt = config.prompts.issue_detection
      .replace('{readme_content}', readmeContent)
      .replace('{issue_title}', issueTitle)
      .replace('{issue_body}', issueBody);
    
    // 调用AI进行判断
    core.info('准备调用AI模型: ' + aiModel);
    core.info('API Base URL: https://models.github.ai/inference');
    
    let aiResponse;
    try {
      aiResponse = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.ai_settings.max_tokens,
        temperature: config.ai_settings.temperature
      });
    } catch (aiError) {
      core.error('AI API调用失败: ' + aiError.message);
      if (aiError.response) {
        core.error('状态码: ' + aiError.response.status);
        core.error('响应体: ' + JSON.stringify(aiError.response.data));
      }
      throw aiError;
    }
    
    const decision = aiResponse.choices[0].message.content.trim().toUpperCase();
    core.info('AI决策结果: ' + decision);
    
    if (decision === 'CLOSE') {
      // 添加评论说明关闭原因
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body: config.responses.issue_closed
      });
      
      // 关闭Issue
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: 'closed'
      });
      
      // 锁定Issue
      await octokit.rest.issues.lock({
        owner,
        repo,
        issue_number: issue.number,
        lock_reason: 'spam'
      });
      
      core.info('Issue #' + issue.number + ' 已被关闭并锁定');
    } else {
      core.info('Issue #' + issue.number + ' 通过检查，保持开放状态');
    }
    
  } catch (error) {
    core.error('处理Issue时出错: ' + error.message);
    throw error;
  }
}

async function handleNewPR(octokit, openai, context, owner, repo, aiModel, config) {
  try {
    const pr = context.payload.pull_request;
    const prTitle = pr.title;
    const prBody = pr.body || '';
    
    core.info('检查PR: ' + prTitle);
    
    // 构建AI检查提示
    const prompt = config.prompts.pr_detection
      .replace('{pr_title}', prTitle)
      .replace('{pr_body}', prBody);
    
    // 调用AI进行判断
    core.info('准备调用AI模型: ' + aiModel);
    
    let aiResponse;
    try {
      aiResponse = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.ai_settings.max_tokens,
        temperature: config.ai_settings.temperature
      });
    } catch (aiError) {
      core.error('AI API调用失败: ' + aiError.message);
      if (aiError.response) {
        core.error('状态码: ' + aiError.response.status);
        core.error('响应体: ' + JSON.stringify(aiError.response.data));
      }
      throw aiError;
    }
    
    const decision = aiResponse.choices[0].message.content.trim().toUpperCase();
    core.info('AI决策结果: ' + decision);
    
    if (decision === 'CLOSE') {
      // 添加评论说明关闭原因
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: config.responses.pr_closed
      });
      
      // 关闭PR
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr.number,
        state: 'closed'
      });
      
      core.info('PR #' + pr.number + ' 已被关闭');
    } else {
      core.info('PR #' + pr.number + ' 通过检查，保持开放状态');
    }
    
  } catch (error) {
    core.error('处理PR时出错: ' + error.message);
    throw error;
  }
}

run();