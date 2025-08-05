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

// 统一的AI API调用函数
async function callAI(openai, aiModel, prompt, config, purpose = 'AI调用') {
  try {
    core.info('准备进行' + purpose + '，使用模型: ' + aiModel);
    
    const response = await openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.ai_settings.max_tokens,
      temperature: config.ai_settings.temperature
    });
    
    const result = response.choices[0].message.content.trim().toUpperCase();
    core.info(purpose + '结果: ' + result);
    return result;
    
  } catch (aiError) {
    core.error(purpose + '失败: ' + aiError.message);
    if (aiError.response) {
      core.error('状态码: ' + aiError.response.status);
      core.error('响应体: ' + JSON.stringify(aiError.response.data));
    }
    throw aiError;
  }
}

async function run() {
  try {
    // 加载配置文件
    const config = loadConfig();
    
    // 获取输入参数
    const token = core.getInput('github-token') || process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const aiModel = core.getInput('ai-model') || process.env.INPUT_AI_MODEL || 'openai/gpt-4o';
    const labelsInput = core.getInput('labels') || process.env.INPUT_LABELS || 'bug,enhancement';
    
    // 解析标签列表
    const labelsList = labelsInput.split(',').map(label => label.trim()).filter(label => label.length > 0);
    
    // 初始化GitHub客户端
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // 初始化OpenAI客户端
    const openai = new OpenAI({
      baseURL: 'https://models.github.ai/inference',
      apiKey: token
    });
    
    core.info('API Base URL: https://models.github.ai/inference');
    core.info('使用AI模型: ' + aiModel);

    // 获取仓库信息
    const { owner, repo } = context.repo;
    
    // 根据事件类型处理
    if (context.eventName === 'issues' && context.payload.action === 'opened') {
      await handleNewIssue(octokit, openai, context, owner, repo, aiModel, config, labelsList);
    } else if (context.eventName === 'pull_request' && context.payload.action === 'opened') {
      await handleNewPR(octokit, openai, context, owner, repo, aiModel, config);
    } else {
      core.info('事件类型不匹配，跳过处理');
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
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'Issue垃圾检测');
    
    if (decision === 'CLOSE') {
      // 构建README链接
      const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
      
      // 添加评论说明关闭原因
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body: config.responses.issue_closed.replace('{readme_url}', readmeUrl)
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
      
      // 对于通过检查的Issue，进行分类并添加标签
      await classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList);
    }
    
  } catch (error) {
    core.error('处理Issue时出错: ' + error.message);
    throw error;
  }
}

async function classifyAndLabelIssue(octokit, openai, owner, repo, issue, issueTitle, issueBody, aiModel, config, labelsList) {
  try {
    core.info('开始对Issue进行分类: #' + issue.number);
    core.info('可用标签: ' + labelsList.join(', '));
    
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
      core.error('AI分类调用失败，跳过分类: ' + aiError.message);
      return;
    }
    
    // 查找匹配的标签
    const matchedLabel = labelsList.find(label => 
      classification.toUpperCase() === label.toUpperCase()
    );
    
    if (matchedLabel) {
      try {
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: issue.number,
          labels: [matchedLabel]
        });
        core.info('已为Issue #' + issue.number + ' 添加标签: ' + matchedLabel);
      } catch (labelError) {
        core.warning('添加标签失败: ' + labelError.message);
      }
    } else {
      core.info('Issue #' + issue.number + ' 分类结果不匹配任何预设标签: ' + classification);
    }
    
  } catch (error) {
    core.warning('Issue分类过程出错: ' + error.message);
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
    
    // 调用AI进行垃圾检测
    const decision = await callAI(openai, aiModel, prompt, config, 'PR垃圾检测');
    
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