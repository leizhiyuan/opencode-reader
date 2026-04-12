# OpenCode Reader

Chrome 扩展：配合本地 [OpenCode](https://opencode.ai) 服务，在浏览器侧边栏提供 AI 阅读辅助。

<img width="1169" height="706" alt="image" src="https://github.com/user-attachments/assets/9f82cef5-7ac9-48ef-a0ae-fe90edbc7692" />

## 功能

- **选词解释** — 选中文字 → 右键 → AI 在侧边栏解释含义、搭配、用法
- **文章感知** — 每个网页独立会话，AI 自动阅读当前文章，解释基于文章上下文
- **自由对话** — 侧边栏底部输入框可直接提问，与 AI 讨论文章内容
- **上下文保留** — 同一网页内的所有查询共享会话，AI 记住之前的对话
- **实时响应** — 通过 SSE 事件流实时显示 AI 回复
- **Markdown 渲染** — AI 回复自动渲染标题、代码块、表格、列表等格式

## 安装与使用

### 1. 安装 OpenCode

前往 [opencode.ai](https://opencode.ai) 下载并安装 OpenCode CLI。

### 2. 启动 OpenCode 服务

在终端运行：

```bash
opencode serve --port 19877
```

保持终端窗口打开，服务运行期间扩展才能工作。

### 3. 安装 Chrome 扩展

1. 前往 [Releases 页面](https://github.com/leizhiyuan/opencode-reader/releases) 下载最新的 `opencode-reader.crx`
2. 打开 Chrome，访问 `chrome://extensions/`
3. 将下载的 `.crx` 文件拖拽到扩展页面中完成安装

### 4. 开始使用

1. 打开任意文章页面
2. 选中一个词或句子 → 右键 → 「AI 解释」
3. 侧边栏打开，AI 自动阅读文章并解释选中内容
4. 在底部输入框可继续提问，讨论文章内容

## 开发者指南

如果你想参与开发或从源码加载：

1. Clone 仓库：`git clone https://github.com/leizhiyuan/opencode-reader.git`
2. 打开 `chrome://extensions/` → 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择项目目录

### 项目结构

```
├── manifest.json      # 扩展清单 (Manifest V3)
├── background.js      # 右键菜单、session 管理、文章初始化
├── content.js         # 内容脚本：获取选区上下文段落
├── sidepanel.html     # 侧边栏 UI
├── sidepanel.js       # 对话逻辑、SSE 事件监听
├── lib/
│   ├── marked.min.js  # Markdown 解析
│   └── purify.min.js  # HTML 净化 (DOMPurify)
└── icons/             # 扩展图标
```

### 技术栈

- Chrome Extension Manifest V3 (Side Panel API)
- OpenCode REST API + SSE
- [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify)
- 原生 JavaScript，无构建工具

## License

MIT
