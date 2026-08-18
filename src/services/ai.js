const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');

const CONTENT_FILTER_MARKERS = [
  'content_filter',
  'content policy violation',
  'content management policy',
  'responsibleaipolicyviolation',
  'prompt attack',
  'jailbreak'
];

/**
 * 判断AI服务是否因输入内容过滤而拒绝请求。
 * 只处理带明确过滤信号的400响应，避免把鉴权、模型或参数错误误判为恶意内容。
 */
function isContentFilterError(error) {
  const status = error?.status || error?.response?.status || error?.statusCode;
  if (status !== 400) return false;

  const details = JSON.stringify({
    code: error?.code,
    type: error?.type,
    message: error?.message,
    error: error?.error,
    response: error?.response?.data,
    cause: error?.cause
  }).toLowerCase();

  return CONTENT_FILTER_MARKERS.some(marker => details.includes(marker));
}

function getResponsesText(response) {
  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  return (response.output || [])
    .flatMap(item => item.content || [])
    .map(content => content.text || content.value || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * 统一的AI API调用函数
 * @param {Object} openai OpenAI客户端实例
 * @param {string} aiModel AI模型名称
 * @param {string} prompt 提示词
 * @param {Object} config 配置对象
 * @param {string} purpose 调用目的描述
 * @param {boolean} normalizeResult 是否将响应转为大写判定值
 * @returns {Promise<string>} AI响应结果
 */
async function callAI(openai, aiModel, prompt, config, purpose = 'AI调用', normalizeResult = true) {
  try {
    core.info(logMessage(config.logging.ai_call_start, { purpose, model: aiModel }));
    
    let content;
    if (config.ai_settings.api_type === 'responses') {
      const response = await openai.responses.create({
        model: aiModel,
        input: prompt,
        max_output_tokens: config.ai_settings.max_tokens,
        store: false
      });
      content = getResponsesText(response);
    } else {
      const response = await openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.ai_settings.max_tokens,
        temperature: config.ai_settings.temperature
      });
      content = response.choices[0].message.content;
    }

    if (!content?.trim()) {
      throw new Error('AI response did not contain text output');
    }

    content = content.trim();
    const result = normalizeResult ? content.toUpperCase() : content;
    core.info(logMessage(config.logging.ai_call_result, { purpose, result }));
    return result;
    
  } catch (aiError) {
    core.error(logMessage(config.logging.ai_call_failed, { purpose, error: aiError.message }));

    const status = aiError.status || aiError.response?.status || aiError.statusCode;
    const responseBody = aiError.error || aiError.response?.data;
    if (status) {
      core.error(logMessage(config.logging.ai_status_code, { code: status }));
    }
    if (responseBody) {
      core.error(logMessage(config.logging.ai_response_body, { body: JSON.stringify(responseBody) }));
    }

    throw aiError;
  }
}

module.exports = {
  callAI,
  isContentFilterError
};
