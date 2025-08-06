const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');
const { closeIssue, addComment } = require('../services/github');

/**
 * 处理垃圾Issue
 * @param {Object} octokit GitHub API客户端
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {Object} issue Issue对象
 * @param {Object} config 配置对象
 */
async function handleSpamIssue(octokit, owner, repo, issue, config) {
  const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_closed.replace('{readme_url}', readmeUrl),
    config,
    true
  );
  
  core.info(logMessage(config.logging.issue_closed_log, { number: issue.number }));
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
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_basic, 
    config,
    true
  );
  
  core.info(logMessage(config.logging.issue_basic_log, { number: issue.number }));
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
  const readmeUrl = `https://github.com/${owner}/${repo}#readme`;
  
  await closeIssue(
    octokit, 
    owner, 
    repo, 
    issue.number, 
    config.responses.issue_closed.replace('{readme_url}', readmeUrl),
    config,
    true
  );
  
  core.info(logMessage(config.logging.issue_closed_log, { number: issue.number }));
}

module.exports = {
  handleSpamIssue,
  handleBasicIssue,
  handleUnclearIssue,
  handleBlacklistedUser
};
