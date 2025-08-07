const core = require('@actions/core');

/**
 * 日志消息模板处理函数
 * @param {string} template 消息模板
 * @param {Object} replacements 替换变量
 * @returns {string} 处理后的消息
 */
function logMessage(template, replacements = {}) {
  let message = template;
  for (const [key, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return message;
}

/**
 * 通用错误处理包装函数
 * @param {Function} operation 要执行的操作
 * @param {string} errorMessage 错误信息
 * @returns {Promise<any>} 操作结果
 */
async function handleApiCall(operation, errorMessage) {
  try {
    return await operation();
  } catch (error) {
    core.warning(`${errorMessage}: ${error.message}`);
    throw error;
  }
}

/**
 * 批量执行API调用
 * @param {Array} calls API调用数组
 * @returns {Promise<Array>} 调用结果数组
 */
async function executeApiCalls(calls) {
  const results = [];
  for (const call of calls) {
    try {
      const result = await handleApiCall(call.operation, call.errorMessage);
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error });
    }
  }
  return results;
}

/**
 * 检查PR标题是否符合Commit规范
 * @param {string} title PR标题
 * @returns {boolean} 是否符合规范
 */
function isValidCommitTitle(title) {
  // Conventional Commits 规范
  // 格式: <type>[optional scope]: <description>
  // type: feat, fix, docs, style, refactor, test, chore, etc.
  const commitRegex = /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?: .{1,}$/i;
  
  return commitRegex.test(title.trim());
}

module.exports = {
  logMessage,
  handleApiCall,
  executeApiCalls,
  isValidCommitTitle
};
