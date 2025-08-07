/**
 * 自定义错误类
 */

/**
 * 配置错误
 */
class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * AI调用错误
 */
class AIError extends Error {
  constructor(message, statusCode = null, response = null) {
    super(message);
    this.name = 'AIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * GitHub API错误
 */
class GitHubAPIError extends Error {
  constructor(message, statusCode = null, response = null) {
    super(message);
    this.name = 'GitHubAPIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * 内容分析错误
 */
class AnalysisError extends Error {
  constructor(message, analysisType = null) {
    super(message);
    this.name = 'AnalysisError';
    this.analysisType = analysisType;
  }
}

module.exports = {
  ConfigError,
  AIError,
  GitHubAPIError,
  AnalysisError
};
