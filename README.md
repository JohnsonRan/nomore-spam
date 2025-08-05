# NoMore Spam GitHub Action

基于AI的GitHub Action工具，自动检测并关闭垃圾Issue/PR，为有效Issue智能分类打标签。

## 功能特性

- 🤖 **AI驱动检测**: 使用GitHub Models API进行智能垃圾内容检测
- 📝 **Issue检查**: 检测新Issue是否已在README中提到或为垃圾信息
- 🔄 **PR检查**: 检测新Pull Request是否为垃圾信息
- 🔒 **自动处理**: 自动关闭并锁定检测到的垃圾内容
- 🏷️ **智能标签**: 为通过检测的Issue自动分类并添加相应标签
- 💬 **友好提示**: 为被关闭的Issue/PR添加说明评论

## 使用方法

### 1. 创建工作流文件

在你的仓库中创建 `.github/workflows/nomore-spam.yml`：

```yaml
name: NoMore Spam

on:
  issues:
    types: [opened]
  pull_request:
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
          ai-model: 'openai/gpt-4o'
```

### 2. 自定义配置

#### 输入参数

| 参数 | 描述 | 必需 | 默认值 |
|------|------|------|--------|
| `github-token` | - | 是 | `${{ github.token }}` |
| `ai-model` | 模型名称 | 否 | `openai/gpt-4o` |

## 检测逻辑

### Issue检测

对于新创建的Issue，Action会：

1. **垃圾检测**: 读取仓库的README.md文件内容，将Issue标题、内容和README内容一起发送给AI
2. **智能判断**: AI判断Issue是否：
   - 内容已在README中提到或解决
   - 明显的垃圾信息或无意义内容
3. **自动处理**: 如果判断为垃圾内容，则：
   - 添加解释评论
   - 关闭Issue
   - 锁定Issue（标记为spam）
4. **智能分类**: 如果Issue通过垃圾检测，系统会进一步：
   - 分析Issue的类型和内容
   - 自动分类为：`bug`（错误报告）、`enhancement`（功能请求）或其他
   - 为Issue添加相应的标签，便于项目管理

### Pull Request检测

对于新创建的PR，Action会：

1. 分析PR的标题和描述内容
2. AI判断PR是否为垃圾信息：
   - 无意义的随机内容
   - 恶意内容或广告
   - 与项目完全无关
   - 明显的测试或玩笑性质
3. 如果判断为垃圾PR，则：
   - 添加解释评论
   - 关闭PR

## 权限要求

确保GitHub Token具有以下权限：

- `contents: read` - 读取README.md文件
- `issues: write` - 关闭、锁定Issue和添加标签
- `pull-requests: write` - 关闭Pull Request
- `models: read` - 访问GitHub Models API

## 自动标签功能

### 支持的标签类型

- 🐛 **bug**: 自动为错误报告、程序崩溃、异常行为等Issue添加
- ✨ **enhancement**: 自动为功能请求、改进建议等Issue添加

### 标签配置

可以在`config.json`中自定义标签名称：

```json
{
  "labels": {
    "bug": "bug",
    "enhancement": "enhancement"
  }
}
```

Action会智能分析Issue内容，识别其类型并自动添加相应标签，帮助维护者更好地管理和优先处理Issue。
