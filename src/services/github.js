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
 * @param {string} stateReason 关闭原因
 * @returns {Promise<Array>} API调用结果数组
 */
async function closeIssue(octokit, owner, repo, issueNumber, comment, config, shouldLock = true, stateReason = 'not_planned') {
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
        state_reason: stateReason
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
 * @param {boolean} shouldLock 是否锁定PR
 * @returns {Promise<Array>} API调用结果数组
 */
async function closePR(octokit, owner, repo, prNumber, comment, config, shouldLock = true) {
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

  if (shouldLock) {
    calls.push({
      operation: () => octokit.rest.issues.lock({
        owner,
        repo,
        issue_number: prNumber,
        lock_reason: config.defaults.lock_reason
      }),
      errorMessage: config.logging.pr_lock_failed
    });
  }

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

/**
 * 使用GraphQL API获取仓库真正的置顶Issues
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} config 配置对象
 * @returns {Promise<Array>} 置顶Issues数组
 */
async function getRealPinnedIssues(octokit, owner, repo, config) {
  try {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pinnedIssues(first: 10) {
            nodes {
              issue {
                title
                body
                number
                url
                createdAt
                state
              }
              pinnedBy {
                login
              }
            }
          }
        }
      }
    `;

    const response = await handleApiCall(
      () => octokit.graphql(query, { owner, repo }),
      config.logging.pinned_issues_fetch_failed
    );

    const pinnedIssues = response?.repository?.pinnedIssues?.nodes || [];
    
    // 将PinnedIssue对象转换为Issue对象
    return pinnedIssues.map(pinnedIssue => ({
      ...pinnedIssue.issue,
      pinnedBy: pinnedIssue.pinnedBy
    }));
  } catch (error) {
    console.warn(`获取置顶Issues失败 (${owner}/${repo}):`, error.message);
    return [];
  }
}

/**
 * 格式化置顶Issues内容 - 解耦的纯函数
 * @param {Array} pinnedIssues 置顶Issues数组
 * @returns {string} 格式化后的内容
 */
function formatPinnedIssuesContent(pinnedIssues) {
  if (!Array.isArray(pinnedIssues) || pinnedIssues.length === 0) {
    return '';
  }

  return pinnedIssues.map(issue => {
    const title = issue.title || '(无标题)';
    const body = issue.body || '(无描述)';
    const number = issue.number || '未知';
    const state = issue.state === 'CLOSED' ? '已关闭' : '开启';
    const pinnedBy = issue.pinnedBy?.login || '未知';
    
    return `## ${title} (#${number}) - ${state}\n置顶者: ${pinnedBy}\n\n${body}\n\n---`;
  }).join('\n\n');
}

/**
 * 获取仓库置顶Issues内容
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} config 配置对象
 * @returns {Promise<string>} 置顶Issues的格式化内容
 */
async function getPinnedIssuesContent(octokit, owner, repo, config) {
  try {
    console.log(`正在获取仓库置顶Issues: ${owner}/${repo}`);
    
    // 使用GraphQL API获取真正的置顶Issues
    const pinnedIssues = await getRealPinnedIssues(octokit, owner, repo, config);
    
    console.log(`找到 ${pinnedIssues.length} 个置顶Issues`);
    
    if (pinnedIssues.length > 0) {
      pinnedIssues.forEach((issue, index) => {
        console.log(`  ${index + 1}. #${issue.number}: ${issue.title} (${issue.state})`);
      });
    }
    
    // 格式化并返回内容 - 使用解耦的纯函数
    return formatPinnedIssuesContent(pinnedIssues);
    
  } catch (error) {
    console.error(`获取置顶Issues过程中出错 (${owner}/${repo}):`, error.message);
    return '';
  }
}

module.exports = {
  addComment,
  addLabels,
  closeIssue,
  closePR,
  getReadmeContent,
  getPinnedIssuesContent
};
