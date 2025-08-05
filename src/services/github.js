const { handleApiCall, executeApiCalls } = require('../utils/helpers');

/**
 * 添加评论的通用函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {number} issueNumber Issue/PR编号
 * @param {string} comment 评论内容
 * @param {string} errorMessage 错误消息
 * @returns {Promise<any>} API调用结果
 */
async function addComment(octokit, owner, repo, issueNumber, comment, errorMessage) {
  return await handleApiCall(
    () => octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment
    }),
    errorMessage
  );
}

/**
 * 添加标签的通用函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {number} issueNumber Issue编号
 * @param {Array} labels 标签数组
 * @param {string} errorMessage 错误消息
 * @returns {Promise<any>} API调用结果
 */
async function addLabels(octokit, owner, repo, issueNumber, labels, errorMessage) {
  return await handleApiCall(
    () => octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: labels
    }),
    errorMessage
  );
}

/**
 * 关闭Issue的通用函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {number} issueNumber Issue编号
 * @param {string} comment 关闭评论
 * @param {Object} config 配置对象
 * @param {boolean} shouldLock 是否锁定Issue
 * @returns {Promise<Array>} API调用结果数组
 */
async function closeIssue(octokit, owner, repo, issueNumber, comment, config, shouldLock = true) {
  const calls = [
    {
      operation: () => octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment
      }),
      errorMessage: config.logging.issue_comment_failed
    },
    {
      operation: () => octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: 'not_planned'
      }),
      errorMessage: config.logging.issue_close_failed
    }
  ];

  if (shouldLock) {
    calls.push({
      operation: () => octokit.rest.issues.lock({
        owner,
        repo,
        issue_number: issueNumber,
        lock_reason: config.defaults.lock_reason
      }),
      errorMessage: config.logging.issue_lock_failed
    });
  }

  return await executeApiCalls(calls);
}

/**
 * 关闭PR的通用函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {number} prNumber PR编号
 * @param {string} comment 关闭评论
 * @param {Object} config 配置对象
 * @returns {Promise<Array>} API调用结果数组
 */
async function closePR(octokit, owner, repo, prNumber, comment, config) {
  const calls = [
    {
      operation: () => octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment
      }),
      errorMessage: config.logging.pr_comment_failed
    },
    {
      operation: () => octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        state: 'closed'
      }),
      errorMessage: config.logging.pr_close_failed
    }
  ];

  return await executeApiCalls(calls);
}

/**
 * 获取仓库README内容
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} config 配置对象
 * @returns {Promise<string>} README内容
 */
async function getReadmeContent(octokit, owner, repo, config) {
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
      const content = Buffer.from(readmeResponse.data.content, 'base64').toString('utf8');
      return content;
    }
    return '';
  } catch (error) {
    return '';
  }
}

module.exports = {
  addComment,
  addLabels,
  closeIssue,
  closePR,
  getReadmeContent
};
