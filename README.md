# OpenCode Reading Assistant

Chrome 扩展：配合本地 [OpenCode](https://opencode.ai) 服务，在浏览器侧边栏提供 AI 阅读辅助。

## 功能

- **选词解释** — 选中文字 → 右键 → AI 在侧边栏解释含义、搭配、用法
- **文章感知** — 每个网页独立会话，AI 自动阅读当前文章，解释基于文章上下文
- **自由对话** — 侧边栏底部输入框可直接提问，与 AI 讨论文章内容
- **上下文保留** — 同一网页内的所有查询共享会话，AI 记住之前的对话
- **实时响应** — 通过 SSE 事件流实时显示 AI 回复

## 使用

### 1. 启动 OpenCode 服务器

```bash
opencode serve --port 19877
```

### 2. 加载扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本项目目录

### 3. 使用

- 打开任意英文文章
- 选中一个词或句子 → 右键 → 「AI 解释」
- 侧边栏打开，AI 自动阅读文章并解释选中内容
- 在底部输入框继续提问

## 架构

```
网页选词 → Chrome Extension (右键菜单 + content script 获取上下文)
                ↓
          background.js (管理 tab → session 映射，自动初始化)
                ↓
          sidepanel.js (对话 UI + SSE 实时渲染)
                ↓
          OpenCode serve (localhost:19877) → AI 模型
```

## 项目结构

```
├── manifest.json      # 扩展清单 (Manifest V3)
├── background.js      # 右键菜单、session 管理、文章初始化
├── content.js         # 内容脚本：获取选区上下文段落
├── sidepanel.html     # 侧边栏 UI
├── sidepanel.js       # 对话逻辑、SSE 事件监听
└── icons/             # 扩展图标
```

## 技术栈

- Chrome Extension Manifest V3 (Side Panel API)
- OpenCode REST API + SSE (`/session`, `/session/:id/message`, `/global/event`)
- 原生 JavaScript，无构建工具

## License

MIT
