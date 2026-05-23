# @ai-ins/nextjs

`@ai-ins/nextjs` 提供 AI Ins 的 Next.js 适配，支持开发态下的 Webpack / Turbopack，并自动转发 AI Ins middleware 请求。

## 安装

```bash
pnpm add -D @ai-ins/nextjs
# or
npm install -D @ai-ins/nextjs
# or
yarn add -D @ai-ins/nextjs
```

## 最小示例

```ts
import { withAiIns } from '@ai-ins/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAiIns(nextConfig)
```

同时在项目根目录添加或更新 `instrumentation-client.ts`（或 `instrumentation-client.js`）：

```ts
import '@ai-ins/nextjs/client'
```

## 它会做什么

- 在开发态启动本地 AI Ins middleware server。
- 通过 `rewrites()` 转发 `__ai-ins`、`__ai-ins-agent`、`__open-in-editor` 等请求。
- 在 Webpack dev server 下为客户端入口注入 AI Ins runtime，并追加 source loader。
- 在 Turbopack 下通过 `turbopack.rules` 为 JSX / TSX 文件挂载同一份 source loader。

## 配置示例

```ts
import { withAiIns } from '@ai-ins/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default withAiIns(nextConfig, {
  middlewarePort: 43001,
  agents: {
    defaultProvider: 'copilot',
  },
})
```

## 选项

`AiInsNextPluginOptions` = `AiInsPluginOptions` + `middlewarePort?`：

| 选项 | 说明 |
| --- | --- |
| `middlewarePort` | 指定本地 middleware server 监听端口；不传时会自动分配可用端口。 |
| `root` | 指定 AI Ins 允许访问的项目根目录，默认使用 Next.js app 目录。 |
| `proxy` | 为所有 Agent provider 设置统一代理。 |
| `disableSourceAttributes` | 关闭 JSX / TSX 源码定位属性注入。 |
| `agents.defaultProvider` | 设置面板默认 provider。 |
| `agents.providers` | 追加或覆盖内置 provider。 |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | 覆盖对应 CLI 的命令、模型与代理配置。 |

## 接入检查清单

- `next.config.*` 已通过 `withAiIns()` 包装。
- `instrumentation-client.ts` 或 `instrumentation-client.js` 已引入 `@ai-ins/nextjs/client`。
- 本地已安装至少一个可执行的 Agent CLI（例如 Codex、Claude、Copilot、Gemini 或 Cursor）。

## 相关文档

- [仓库总览](../../README.md)
- [CLI 文档](../cli/README.md)
- [Core API 文档](../core/README.md)
