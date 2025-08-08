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
          github-token: ${{ github.token }}
```

### 2. 自定义配置

#### 输入参数

| 参数 | 描述 | 必需 | 默认值 |
|------|------|------|--------|
| `github-token` | - | 是 | `${{ github.token }}` |
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
          github-token: ${{ github.token }}
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

对于新创建的Issue，Action会进行分层智能检测：

1. **模板智能识别**: 自动检测Issue是否使用了GitHub Issue模板
   - 识别常见模板模式（如标题前缀、Markdown标题、表格等）
   - 提取用户实际填写的内容，过滤模板结构
   - 分析内容质量和完整性

2. **分层检测流程**: 采用三步检测策略，确保准确判断：
   
   **第一步 - 垃圾检测**: 
   - 检测明显的垃圾信息、随机字符、广告内容等
   - 只有明确的垃圾内容才会被立即关闭并锁定
   
   **第二步 - README覆盖检查**: 
   - 检查问题是否已在README或置顶Issues中有明确回答
   - 只有100%确定已被覆盖的问题才会生成基于README的回答并关闭
   - 避免AI幻觉导致的误判
   
   **第三步 - 内容质量检查**: 
   - **UNCLEAR**: 描述过于简单，系统会尝试结合README内容提供智能回答，如无法提供有用信息才添加补充信息提示
   - **BASIC**: 基础使用问题，建议用户善用搜索引擎，关闭并锁定
   - **VALID**: 描述清楚且有效的正常Issue，继续处理

3. **智能分类**: 对于通过所有检测的Issue，系统会：
   - 使用提取的用户实际内容（而非模板结构）进行AI分析
   - 根据 `labels` 参数中指定的标签列表进行AI分析
   - 动态判断Issue属于哪种类型（如bug、enhancement、question等）
   - 自动为Issue添加最匹配的标签，便于项目管理

### Pull Request检测

对于新创建的PR，Action也采用分层检测：

1. **第一步 - 垃圾检测**: 
   - 检测明显的垃圾内容、随机字符、广告等
   - 分析文件变更是否有意义
   
2. **第二步 - 提交规范检查**: 
   - 使用AI检查PR标题是否符合Git提交规范
   - 如 `feat: 添加新功能`、`fix: 修复问题`、`docs: 更新文档` 等
   
3. **第三步 - PR质量检查**: 
   - **UNCLEAR**: 目的不明确，缺乏描述（暂时保持开启）
   - **MALICIOUS**: 包含恶意或可疑内容，关闭并锁定
   - **TRIVIAL**: 无意义的变更或纯测试内容，关闭并锁定
   - **VALID**: 有价值的合法PR，保持开启

4. **文件变更分析**（可选）: 如果启用 `analyze-file-changes`，还会分析：
   - 修改的文件名和状态
   - 添加/删除的行数统计
   - 实际的代码变更内容（受限制的行数）

## 权限要求

确保GitHub Token具有以下权限：

- `contents: read` - 读取README.md文件
- `issues: write` - 关闭、锁定Issue和添加标签
- `pull-requests: write` - 关闭Pull Request
- `models: read` - 访问GitHub Models API
