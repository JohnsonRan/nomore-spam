# NoMore Spam

[English](README.md) | **简体中文**

一款由 AI 驱动的 GitHub Action，用于检测垃圾内容、低质量 Issue 和可疑 Pull Request。它还可以使用仓库标签对有效的 Issue 和 Pull Request 进行分类。

## 功能

- 检测垃圾或无意义的 Issue 和 Pull Request
- 检查 Issue 是否已被 README 或置顶 Issue 完整解答
- 要求描述不清的 Bug 报告补充信息
- 验证 Pull Request 标题，并可选择分析文件变更
- 使用可配置标签对有效的 Issue 和 Pull Request 进行分类
- 关闭被 AI 提供商明确内容安全过滤器拒绝的内容，同时不把普通 API 错误误判为恶意内容
- 将可信检测指令与不可信的 Issue、Pull Request 和仓库内容分离
- 支持 GitHub Models 和兼容 OpenAI API 的提供商
- 支持英文和简体中文机器人回复
- 支持用户名黑名单

## 使用方法

在仓库中创建 `.github/workflows/nomore-spam.yml`：

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

机器人评论和生成的回答默认使用英文。要使用简体中文：

```yaml
with:
  github-token: ${{ github.token }}
  language: zh-CN
```

## 输入参数

| 参数 | 描述 | 必需 | 默认值 |
| --- | --- | --- | --- |
| `github-token` | 用于读取仓库内容以及管理 Issue 或 Pull Request 的 GitHub Token | 是 | `${{ github.token }}` |
| `ai-model` | AI 模型名称 | 否 | `openai/gpt-4o` |
| `ai-base-url` | 兼容 OpenAI API 的基础 URL；不填写则使用 GitHub Models | 否 | GitHub Models 端点 |
| `ai-api-key` | 自定义提供商的 API Key；不填写则使用 GitHub Token | 否 | 空 |
| `ai-api-type` | API 接口：`chat-completions` 或 `responses` | 否 | `chat-completions` |
| `labels` | AI 分类可使用的逗号分隔标签 | 否 | `bug,enhancement,question` |
| `language` | 机器人回复语言：`en` 或 `zh-CN` | 否 | `en` |
| `analyze-file-changes` | 在分析中包含有限的 Pull Request 文件变更 | 否 | `true` |
| `max-analysis-depth` | 文件分析深度：`light`、`normal` 或 `deep` | 否 | `normal` |
| `blacklist` | 无需 AI 分析、直接关闭的逗号分隔 GitHub 用户名 | 否 | 空 |

## 完整示例

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

`ai-base-url` 必须是提供商的 API 基础 URL，而不是完整端点路径。使用 `ai-api-type: responses` 调用 `/responses`；默认的 `chat-completions` 调用 `/chat/completions`。Responses 请求会设置 `store: false`，因此 Issue 和 Pull Request 内容不会因响应状态而被保留。

## 检测流程

### Issue

1. 立即关闭黑名单用户创建的内容。
2. 检测明显的垃圾或无意义内容。
3. 检查 README 或置顶 Issue 是否已完整解答该 Issue。
4. 使用配置的标签对有效 Issue 进行分类。
5. 对类似 Bug 的分类执行额外质量检查。
6. 根据情况要求补充缺失信息，或关闭基础使用问题。

当 AI 提供商返回 `content_filter` 或 `ResponsibleAIPolicyViolation` 等明确内容策略拒绝信号时，NoMore Spam 会添加中立说明并关闭 Issue，但不会锁定它。其他 HTTP 400 响应仍作为普通 Action 错误处理，不会被视为内容违规。

### Pull Request

1. 立即关闭黑名单用户创建的内容。
2. 可选择收集有限的文件变更摘要。
3. 检测垃圾或无意义内容。
4. 验证 Pull Request 标题。
5. 检查 Pull Request 质量以及恶意或无意义的变更。
6. 使用配置的标签对有效 Pull Request 进行分类。

## 语言

`language` 控制机器人评论和 AI 生成的 README 回答：

- `en` — 英文，默认值
- `zh-CN` — 简体中文

不支持的值会回退到英文。为确保解析稳定，检测提示词以及 `SPAM`、`VALID`、`COVERED` 等机器可读判定值仍使用英文。

## 权限

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  models: read
```

- `contents: read` 用于读取仓库 README。
- `issues: write` 用于评论、添加标签、关闭和锁定 Issue。
- `pull-requests: write` 用于评论和关闭 Pull Request。
- `models: read` 用于在未配置自定义提供商时访问 GitHub Models。

## 许可证

[MIT](LICENSE)
