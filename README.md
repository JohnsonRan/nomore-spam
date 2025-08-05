# NoMore Spam GitHub Action

一个用于自动检测和关闭垃圾Issue和Pull Request的GitHub Action，使用AI技术进行智能判断。

## 功能特性

- 🤖 **AI驱动检测**: 使用GitHub Models API进行智能垃圾内容检测
- 📝 **Issue检查**: 检测新Issue是否已在README中提到或为垃圾信息
- 🔄 **PR检查**: 检测新Pull Request是否为垃圾信息
- 🔒 **自动处理**: 自动关闭并锁定检测到的垃圾内容
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

1. 读取仓库的README.md文件内容
2. 将Issue标题、内容和README内容一起发送给AI
3. AI判断Issue是否：
   - 内容已在README中提到或解决
   - 明显的垃圾信息或无意义内容
4. 如果判断为应关闭，则：
   - 添加解释评论
   - 关闭Issue
   - 锁定Issue（标记为spam）

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
- `issues: write` - 关闭和锁定Issue
- `pull-requests: write` - 关闭Pull Request
- `models: read` - 访问GitHub Models API
