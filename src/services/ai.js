const core = require('@actions/core');
const { logMessage } = require('../utils/helpers');

/**
 * 统一的AI API调用函数
 * @param {Object} openai OpenAI客户端实例
 * @param {string} aiModel AI模型名称
 * @param {string} prompt 提示词
 * @param {Object} config 配置对象
 * @param {string} purpose 调用目的描述
 * @returns {Promise<string>} AI响应结果
 */
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

module.exports = {
  callAI
};
