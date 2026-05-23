# @ai-ins/core

`@ai-ins/core` 是 AI Ins 的共享运行时与中间件集合，供 `@ai-ins/vite`、`@ai-ins/webpack`、`@ai-ins/nextjs` 以及自定义集成复用。

> 这个包主要面向框架适配层或二次集成使用，普通项目通常不需要直接安装它。

## 提供的能力

- 生成 AI Ins 客户端脚本。
- 创建 `__ai-ins`、`__ai-ins-agent`、`__open-in-editor` 等 middleware。
- 解析内置 / 自定义 Agent provider。
- 处理代理配置与默认 provider 选择。

## 安装

如果你正在开发自定义集成：

```bash
pnpm add @ai-ins/core
```

## 常用导出

```ts
import {
  createAiInsMiddlewares,
  getAiInsClientCode,
  getAiInsClientWatchFiles,
  getClientAgentProviders,
  getDefaultAgentProviderId,
  normalizeProxy,
} from '@ai-ins/core'
```

## 示例：注册到自定义服务

```ts
import { createAiInsMiddlewares, getAiInsClientCode } from '@ai-ins/core'
import express from 'express'

const app = express()
const root = process.cwd()

for (const route of createAiInsMiddlewares(root, {})) {
  app.use(route.path, route.middleware)
}

app.get('/__ai-ins/client.js', (_req, res) => {
  res.type('application/javascript')
  res.send(getAiInsClientCode({ root }))
})
```

## 核心类型

`AiInsPluginOptions` 支持以下字段：

| 选项 | 说明 |
| --- | --- |
| `root` | 指定 AI Ins 允许访问和编辑的项目根目录。 |
| `proxy` | 设置全局代理。 |
| `disableSourceAttributes` | 关闭源码定位属性注入。 |
| `agents.defaultProvider` | 设置默认 provider。 |
| `agents.providers` | 注册自定义 provider，或覆盖内置 provider。 |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | 覆盖内置 CLI 的命令、模型与代理配置。 |

## 内置 provider

默认会解析以下 provider：

- `codex`
- `claude`
- `copilot`
- `gemini`
- `cursor`

如果对应 CLI 在本地不可执行，`@ai-ins/core` 会把该 provider 标记为 disabled，并返回不可用原因给客户端。

## 相关文档

- [仓库总览](../../README.md)
- [CLI 文档](../cli/README.md)
- [Vite 插件文档](../vite/README.md)
- [Webpack 插件文档](../webpack/README.md)
- [Next.js 插件文档](../nextjs/README.md)
