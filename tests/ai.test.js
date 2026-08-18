const { callAI, isContentFilterError } = require('../src/services/ai');

describe('isContentFilterError', () => {
  test('detects OpenAI content_filter errors', () => {
    expect(isContentFilterError({
      status: 400,
      code: 'content_filter',
      message: 'Prompt was filtered'
    })).toBe(true);
  });

  test('detects Azure ResponsibleAIPolicyViolation responses', () => {
    expect(isContentFilterError({
      response: {
        status: 400,
        data: {
          error: {
            code: 'content_filter',
            innererror: { code: 'ResponsibleAIPolicyViolation' }
          }
        }
      }
    })).toBe(true);
  });

  test('does not treat unrelated 400 errors as content filtering', () => {
    expect(isContentFilterError({
      status: 400,
      code: 'invalid_request_error',
      message: 'Unknown model'
    })).toBe(false);
  });

  test('does not treat authentication failures as content filtering', () => {
    expect(isContentFilterError({
      status: 401,
      message: 'content_filter configuration unavailable'
    })).toBe(false);
  });
});

describe('callAI', () => {
  const config = {
    ai_settings: { max_tokens: 100, temperature: 0.1 },
    logging: {
      ai_call_start: '{purpose} {model}',
      ai_call_result: '{purpose} {result}',
      ai_call_failed: '{purpose} {error}',
      ai_status_code: '{code}',
      ai_response_body: '{body}'
    }
  };

  test('preserves generated answer casing when normalization is disabled', async () => {
    const openai = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Read the setup guide.' } }]
          })
        }
      }
    };

    await expect(callAI(openai, 'model', 'prompt', config, 'answer', false))
      .resolves.toBe('Read the setup guide.');
  });
});
