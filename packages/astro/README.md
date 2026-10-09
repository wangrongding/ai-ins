# @ai-ins/astro

AI Ins 的 Astro integration。`.astro` 模板和 React / Vue / Svelte 岛屿组件都能定位到源码，支持 Astro 4 ~ 7。

**在页面上点一下元素，说一句话，让本地的 AI 编码 Agent 直接改代码。**

开发时按住 `Option`（Windows / Linux 是 `Alt`）点选页面元素，AI Ins 会把元素对应的源码位置和你的需求一起交给本机的 Agent CLI（Codex、Claude Code、Copilot、Gemini、Cursor），改完由热更新直接显示结果。只在开发态生效，生产构建里没有任何 AI Ins 代码。

![AI Ins 对话面板](https://raw.githubusercontent.com/wangrongding/ai-ins/fab60d043e6f4e0a7f4257a6c3596ec32fafb81c/docs/images/conversation.webp)

## 安装

```bash
npx ai-ins
# 或
npx astro add @ai-ins/astro
```

手动接入：

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'
import aiIns from '@ai-ins/astro'

export default defineConfig({
  integrations: [aiIns()],
})
```

只在 `astro dev` 下生效；不需要再单独接 `@ai-ins/vite`。参数与 `@ai-ins/vite` 相同。

## 使用

1. 启动 dev server，打开页面。
2. 按住 `Option` / `Alt` 点选元素，打开面板。
3. 写下需求，按 `⌘ + Enter`（Windows / Linux 为 `Ctrl + Enter`）发送。

前提是本机已经装好并登录至少一个 Agent CLI，比如能在终端里直接运行 `codex` 或 `claude`。建议把 `.ai-ins` 加进 `.gitignore`。

完整文档（多轮会话、改动与 diff、权限、配置项、环境变量）：[https://github.com/wangrongding/ai-ins](https://github.com/wangrongding/ai-ins#readme)
