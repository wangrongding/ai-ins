# @ai-ins/nextjs

[简体中文](./README.md) | [English](./README.en.md)

`@ai-ins/nextjs` 提供 AI Ins 的 Next.js 适配，支持开发态下的 Webpack / Turbopack，并自动转发 AI Ins middleware 请求。

## 安装

```bash
pnpm add -D @ai-ins/nextjs
npm install -D @ai-ins/nextjs
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
