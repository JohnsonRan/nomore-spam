# NoMore Spam
基于AI的GitHub Actions工具，自动检测并关闭垃圾Issue/PR，为有效Issue智能分类打标签。

## 功能特性

- 🤖 **AI驱动检测**: 使用GitHub Models API进行智能垃圾内容检测
- 📝 **模板智能处理**: 自动识别GitHub Issue模板，提取用户实际填写内容，避免AI被模板结构误导
- 🔍 **Issue检查**: 检测新Issue是否已在README中提到或为垃圾信息
- 🧠 **README智能回答**: 对于README相关问题，自动生成基于README内容的简洁回答
- 🔄 **PR检查**: 检测新Pull Request是否为垃圾信息及Commit是否符合规范
- 🔒 **自动处理**: 自动关闭并锁定检测到的垃圾内容
- 🏷️ **智能标签**: 为通过检测的Issue自动分类并添加相应标签
- 💬 **友好提示**: 为被关闭的Issue/PR添加说明评论
- 🚫 **黑名单**: 支持将特定用户加入黑名单，自动关闭其创建的Issue/PR

## 使用方法

### 1. 创建工作流文件

在你的仓库中创建 `.github/workflows/nomore-spam.yml`：

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
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 2. 自定义配置

#### 输入参数

| 参数 | 描述 | 必需 | 默认值 |
|------|------|------|--------|
| `github-token` | - | 是 | `${{ secrets.GITHUB_TOKEN }}` |
| `ai-base-url` | 自定义AI API基础URL（OpenAI兼容），不指定则使用GitHub Models API | 否 | `''` |
| `ai-api-key` | 自定义AI API密钥，不指定则使用GitHub Token | 否 | `''` |
| `ai-model` | 模型名称 | 否 | `openai/gpt-4o` |
| `labels` | 标签列表 | 否 | `bug,enhancement,question` |
| `analyze-file-changes` | 是否分析PR文件变更内容 | 否 | `true` |
| `max-analysis-depth` | 分析深度：`light`(3文件/3行)、`normal`(5文件/5行)、`deep`(10文件/10行) | 否 | `normal` |
| `blacklist` | 黑名单用户列表（逗号分隔的GitHub用户名） | 否 | `''` |

#### 完整配置示例

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
          github-token: ${{ secrets.GITHUB_TOKEN }}
          ai-base-url: ${{ secrets.AI_BASE_URL }}  # 可选：自定义API端点（去除 /chat/completions）
          ai-api-key: ${{ secrets.AI_API_KEY }}  # 可选：自定义API密钥
          ai-model: ${{ secrets.AI_MODEL }}  # 可选：自定义模型名称
          labels: 'bug,enhancement,question'
          analyze-file-changes: 'true'
          max-analysis-depth: 'normal'
          blacklist: ${{ secrets.BLACKLIST }} # 可选：黑名单用户列表
```

## 检测逻辑

### Issue检测

对于新创建的Issue，Action会进行智能检测：

1. **模板智能识别**: 自动检测Issue是否使用了GitHub Issue模板
   - 识别常见模板模式（如标题前缀、Markdown标题、表格等）
   - 提取用户实际填写的内容，过滤模板结构
   - 分析内容质量和完整性

2. **垃圾检测**: 结合仓库README和模板分析结果，使用AI判断Issue质量
3. **智能判断**: AI会判断Issue应该如何处理：
   - **README_COVERED**: 问题已在README中有说明，将生成基于README的简洁回答，关闭但不锁定
   - **SPAM**: 明显的垃圾信息，关闭并锁定
   - **UNCLEAR**: 描述过于简单，缺乏有效信息
   - **BASIC**: 基础使用问题，建议用户善用搜索引擎
   - **KEEP**: 描述清楚且有效的正常Issue

4. **智能分类**: 对于通过垃圾检测的Issue，系统会：
   - 使用提取的用户实际内容（而非模板结构）进行AI分析
   - 根据 `labels` 参数中指定的标签列表进行AI分析
   - 动态判断Issue属于哪种类型（如bug、enhancement、question等）
   - 自动为Issue添加最匹配的标签，便于项目管理

### Pull Request检测

对于新创建的PR，Action会：

1. **基本信息分析**: 分析PR的标题和描述内容
2. **文件变更分析**（可选）: 如果启用 `analyze-file-changes`，还会分析：
   - 修改的文件名和状态
   - 添加/删除的行数统计
   - 实际的代码变更内容（受限制的行数）
3. **AI综合判断**: 判断PR是否为垃圾信息：
   - 无意义的随机内容或字符
   - 恶意内容或广告
   - 与项目完全无关的内容
   - 明显的测试或玩笑性质
   - 无价值的文件变更（如仅添加空行、随机字符等）
4. **自动处理**: 如果判断为垃圾PR，则：
   - 添加解释评论
   - 关闭PR

## 权限要求

确保GitHub Token具有以下权限：

- `contents: read` - 读取README.md文件
- `issues: write` - 关闭、锁定Issue和添加标签
- `pull-requests: write` - 关闭Pull Request
- `models: read` - 访问GitHub Models API
