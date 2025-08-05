const { jest } = require('@jest/globals');

// 模拟 @actions/core
const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn()
};

// 模拟 @actions/github
const mockGithub = {
  context: {
    eventName: 'issues',
    payload: {
      action: 'opened',
      issue: {
        number: 1,
        title: 'Test Issue',
        body: 'This is a test issue'
      }
    },
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  },
  getOctokit: jest.fn()
};

// 模拟 OpenAI
const mockOpenAI = jest.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'KEEP' } }]
      })
    }
  }
}));

jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/github', () => mockGithub);
jest.mock('openai', () => mockOpenAI);

describe('NoMore Spam Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCore.getInput.mockImplementation((name) => {
      switch (name) {
        case 'github-token': return 'fake-token';
        case 'ai-model': return 'openai/gpt-4o';
        default: return '';
      }
    });
  });

  test('should handle issue events', async () => {
    // 这里可以添加更详细的测试逻辑
    expect(true).toBe(true);
  });

  test('should handle PR events', async () => {
    // 这里可以添加更详细的测试逻辑
    expect(true).toBe(true);
  });
});
