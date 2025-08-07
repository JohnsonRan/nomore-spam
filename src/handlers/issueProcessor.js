const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { closeIssue, addComment } = require('../services/github');

/**
 * 通用关闭Issue处理函数
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 * @param {string} responseKey 响应消息键名
 * @param {string} logKey 日志消息键名
 * @param {boolean} shouldLock 是否锁定Issue
 */
async function closeIssueWithType(octokit, owner, repo, issue, config, responseKey, logKey, shouldLock = true) {
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses[responseKey],
    config,
    shouldLock
  );
  
  core.info(logMessage(config.logging[logKey], { number: issue.number }));
}

/**
 * 处理垃圾Issue
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 */
async function handleSpamIssue(octokit, owner, repo, issue, config) {
  await closeIssueWithType(octokit, owner, repo, issue, config, 'issue_spam', 'issue_spam_log', true);
}

/**
 * 处理基础问题Issue
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 */
async function handleBasicIssue(octokit, owner, repo, issue, config) {
  await closeIssueWithType(octokit, owner, repo, issue, config, 'issue_basic', 'issue_basic_log', true);
}

/**
 * 处理描述不清的Issue
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 */
async function handleUnclearIssue(octokit, owner, repo, issue, config) {
  await addComment(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_unclear,
    config.logging.issue_unclear_comment_failed
  );
  
  core.info(logMessage(config.logging.issue_unclear_log, { number: issue.number }));
}

/**
 * 处理黑名单用户的Issue
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 */
async function handleBlacklistedUser(octokit, owner, repo, issue, config) {
  // 如果没有配置黑名单响应，使用垃圾回应
  const responseKey = config.responses.issue_blacklist || config.responses.issue_spam;
  const logKey = config.logging.issue_blacklist_log || config.logging.issue_closed_log;
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    responseKey,
    config,
    true
  );
  
  core.info(logMessage(logKey, { number: issue.number }));
}

module.exports = {
  handleSpamIssue,
  handleBasicIssue,
  handleUnclearIssue,
  handleBlacklistedUser,
  closeIssueWithType
};
