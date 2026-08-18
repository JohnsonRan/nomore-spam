const baseConfig = require('../config.json');
const IssueAnalyzer = require('../src/services/issueAnalyzer');
const { applyLocale } = require('../src/utils/config');

describe('IssueAnalyzer localized answers', () => {
  test('requests English answers and preserves their casing', async () => {
    const config = JSON.parse(JSON.stringify(baseConfig));
    applyLocale(config, 'en');

    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Follow the installation steps.' } }]
    });
    const analyzer = new IssueAnalyzer(
      { chat: { completions: { create } } },
      'model',
      config
    );

    await expect(analyzer.generateReadmeAnswer(
      { title: 'How?', body: 'Need help' },
      'Installation steps are documented here.'
    )).resolves.toBe('Follow the installation steps.');

    const prompt = create.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Respond in English');
    expect(prompt).not.toContain('{answer_language}');
    expect(prompt).not.toContain('{readme_answer_length}');
  });
});
