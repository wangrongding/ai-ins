# @ai-ins/vite

[简体中文](./README.md) | [English](./README.en.md)

`@ai-ins/vite` 提供 AI Ins 的 Vite 插件，用于在开发态注入面板客户端，并为 JSX / Vue / Svelte 模板元素添加源码定位信息。

## 安装

```bash
pnpm add -D @ai-ins/vite
npm install -D @ai-ins/vite
yarn add -D @ai-ins/vite
```

## 最小示例

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import aiIns from '@ai-ins/vite'

export default defineConfig({
  plugins: [
    aiIns(),
    react(),
  ],
})
```

`aiIns()` 需要放在 React / Vue / Svelte 等框架插件前面。

## 它会做什么

- 在 dev server 中注册 `__ai-ins`、`__ai-ins-agent`、`__open-in-editor` 等接口。
- 自动向页面注入 AI Ins 客户端脚本。
- 为工作区内的 `.jsx` / `.tsx` / `.vue` / `.svelte` 文件注入源码定位属性。
- 在客户端面板中展示可用的本地 Agent provider。

## 常用配置

```ts
aiIns({
  root: process.cwd(),
  agents: {
    defaultProvider: 'codex',
  },
  codex: {
    model: 'gpt-5.5',
  },
})
```

## 选项

`@ai-ins/vite` 复用 `@ai-ins/core` 的 `AiInsPluginOptions`：

| 选项 | 说明 |
| --- | --- |
| `root` | AI Ins 可访问的项目根目录，默认使用 Vite `config.root`。 |
| `proxy` | 所有 Agent provider 共用的代理。 |
| `disableSourceAttributes` | 关闭源码定位属性注入。 |
| `agents.defaultProvider` | 设置面板默认 provider。 |
| `agents.providers` | 追加或覆盖内置 provider。 |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | 覆盖对应 CLI 的命令、模型与代理配置。 |
