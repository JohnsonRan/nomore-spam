const baseConfig = require('../config.json');
const { applyLocale, normalizeLanguage } = require('../src/utils/config');

function cloneConfig() {
  return JSON.parse(JSON.stringify(baseConfig));
}

describe('configuration', () => {
  test('uses chat completions by default', () => {
    expect(baseConfig.defaults.ai_api_type).toBe('chat-completions');
  });

  test('defaults unknown languages to English', () => {
    expect(normalizeLanguage('fr')).toBe('en');
    expect(applyLocale(cloneConfig(), 'fr')).toBe('en');
  });

  test('loads English responses by default', () => {
    const config = cloneConfig();
    applyLocale(config, 'en');

    expect(config.responses.issue_spam).toContain('This issue');
    expect(config.locale.answer_language).toBe('English');
  });

  test('loads Simplified Chinese when requested', () => {
    const config = cloneConfig();
    applyLocale(config, 'zh-CN');

    expect(config.responses.issue_spam).toContain('此Issue');
    expect(config.locale.answer_language).toBe('Simplified Chinese');
  });
});
