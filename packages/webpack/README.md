# @ai-ins/webpack

AI Ins 的 Webpack 插件：注册 dev server 中间件、自动注入面板脚本，并在开发构建中给 JSX 元素标上源码位置。

**在页面上点一下元素，说一句话，让本地的 AI 编码 Agent 直接改代码。**

开发时按住 `Option`（Windows / Linux 是 `Alt`）点选页面元素，AI Ins 会把元素对应的源码位置和你的需求一起交给本机的 Agent CLI（Codex、Claude Code、Copilot、Gemini、Cursor），改完由热更新直接显示结果。只在开发态生效，生产构建里没有任何 AI Ins 代码。

![AI Ins 对话面板](https://raw.githubusercontent.com/wangrongding/ai-ins/main/docs/images/conversation.webp)

## 安装

```bash
npx ai-ins          # 自动安装并改好 webpack 配置
# 或手动：
npm i -D @ai-ins/webpack
```

```js
// webpack.config.js（开发配置）
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

有多个 Webpack 配置文件时，用 `npx ai-ins --bundler webpack --config webpack.dev.js` 指定 dev server 实际使用的那个。

## 使用

1. 启动 dev server，打开页面。
2. 按住 `Option` / `Alt` 点选元素，打开面板。
3. 写下需求，按 `⌘ + Enter`（Windows / Linux 为 `Ctrl + Enter`）发送。

前提是本机已经装好并登录至少一个 Agent CLI，比如能在终端里直接运行 `codex` 或 `claude`。建议把 `.ai-ins` 加进 `.gitignore`。

完整文档（多轮会话、改动与 diff、权限、配置项、环境变量）：[https://github.com/wangrongding/ai-ins](https://github.com/wangrongding/ai-ins#readme)
