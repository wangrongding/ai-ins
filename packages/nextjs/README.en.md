# @ai-ins/nextjs

[Simplified Chinese](./README.md) | [English](./README.en.md)

`@ai-ins/nextjs` is the Next.js adapter for AI Ins. It supports both Webpack and Turbopack in development and forwards AI Ins middleware routes automatically.

## Install

```bash
pnpm add -D @ai-ins/nextjs
npm install -D @ai-ins/nextjs
yarn add -D @ai-ins/nextjs
```

## Minimal example

```ts
import { withAiIns } from '@ai-ins/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAiIns(nextConfig)
```

Also add or update `instrumentation-client.ts` (or `.js`) at the project root:

```ts
import '@ai-ins/nextjs/client'
```

## What it does

- starts a local AI Ins middleware server in development,
- forwards `__ai-ins`, `__ai-ins-agent`, and editor routes through `rewrites()`,
- injects the client entry and source loader for Webpack dev server,
- mounts the same source loader through `turbopack.rules` for Turbopack.
