# NoMore Spam

**English** | [简体中文](README.zh-CN.md)

AI-powered GitHub Action for detecting spam, low-quality issues, and suspicious pull requests. It can also classify valid issues and pull requests with repository labels.

## Features

- Detects spam and meaningless issues or pull requests
- Checks whether an issue is already fully answered by the README or pinned issues
- Requests more information for unclear bug reports
- Validates pull request titles and optionally inspects file changes
- Classifies valid issues and pull requests with configurable labels
- Closes content rejected by an AI provider's explicit safety filter without treating ordinary API errors as malicious content
- Supports GitHub Models and OpenAI-compatible API providers
- Supports English and Simplified Chinese bot responses
- Supports username blacklists

## Usage

Create `.github/workflows/nomore-spam.yml` in your repository:

```yaml
name: NoMore Spam

on:
  issues:
    types: [opened]
  pull_request_target:
    types: [opened]

permissions:
  contents: read
  issues: write
  pull-requests: write
  models: read

jobs:
  spam-detection:
    runs-on: ubuntu-latest

    steps:
      - name: Detect and close spam
        uses: JohnsonRan/nomore-spam@main
        with:
          github-token: ${{ github.token }}
```

Bot comments and generated answers use English by default. To use Simplified Chinese:

```yaml
with:
  github-token: ${{ github.token }}
  language: zh-CN
```

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `github-token` | GitHub token used to read repository content and manage issues or pull requests | Yes | `${{ github.token }}` |
| `ai-model` | AI model name | No | `openai/gpt-4o` |
| `ai-base-url` | OpenAI-compatible API base URL. Omit to use GitHub Models | No | GitHub Models endpoint |
| `ai-api-key` | API key for a custom provider. Omit to use the GitHub token | No | Empty |
| `ai-api-type` | API interface: `chat-completions` or `responses` | No | `chat-completions` |
| `labels` | Comma-separated labels available to AI classification | No | `bug,enhancement,question` |
| `language` | Bot response language: `en` or `zh-CN` | No | `en` |
| `analyze-file-changes` | Include limited pull request file changes in analysis | No | `true` |
| `max-analysis-depth` | File analysis depth: `light`, `normal`, or `deep` | No | `normal` |
| `blacklist` | Comma-separated GitHub usernames to close without AI analysis | No | Empty |

## Full example

```yaml
name: NoMore Spam

on:
  issues:
    types: [opened]
  pull_request_target:
    types: [opened]

permissions:
  contents: read
  issues: write
  pull-requests: write
  models: read

jobs:
  spam-detection:
    runs-on: ubuntu-latest

    steps:
      - name: Detect and close spam
        uses: JohnsonRan/nomore-spam@main
        with:
          github-token: ${{ github.token }}
          ai-base-url: ${{ secrets.AI_BASE_URL }}
          ai-api-key: ${{ secrets.AI_API_KEY }}
          ai-api-type: responses
          ai-model: ${{ secrets.AI_MODEL }}
          labels: 'bug,enhancement,question'
          language: en
          analyze-file-changes: 'true'
          max-analysis-depth: normal
          blacklist: ${{ secrets.BLACKLIST }}
```

`ai-base-url` must be the provider's API base URL, not a full endpoint path. Use `ai-api-type: responses` for `/responses`; the default `chat-completions` uses `/chat/completions`.

## Detection flow

### Issues

1. Close blacklisted users immediately.
2. Detect obvious spam or meaningless content.
3. Check whether the README or pinned issues completely answer the issue.
4. Classify valid issues using the configured labels.
5. Run additional quality checks for bug-like classifications.
6. Ask for missing information or close basic usage questions when applicable.

When an AI provider returns an explicit content-policy rejection such as `content_filter` or `ResponsibleAIPolicyViolation`, NoMore Spam adds a neutral explanation and closes the issue without locking it. Other HTTP 400 responses remain normal action failures and are not treated as content violations.

### Pull requests

1. Close blacklisted users immediately.
2. Optionally collect a limited summary of changed files.
3. Detect spam or meaningless content.
4. Validate the pull request title.
5. Check pull request quality and malicious or trivial changes.
6. Classify valid pull requests using the configured labels.

## Languages

`language` controls bot comments and AI-generated README answers:

- `en` — English, default
- `zh-CN` — Simplified Chinese

Unsupported values fall back to English. Detection prompts and machine-readable decisions such as `SPAM`, `VALID`, and `COVERED` remain in English for stable parsing.

## Permissions

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  models: read
```

- `contents: read` reads the repository README.
- `issues: write` comments on, labels, closes, and locks issues.
- `pull-requests: write` comments on and closes pull requests.
- `models: read` accesses GitHub Models when no custom provider is configured.

## License

[MIT](LICENSE)
