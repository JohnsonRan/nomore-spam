const { isContentFilterError } = require('../src/services/ai');

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
