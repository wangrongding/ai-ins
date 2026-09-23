# @ai-ins/core

[Simplified Chinese](./README.md) | [English](./README.en.md)

`@ai-ins/core` contains the shared runtime, middleware, and provider helpers used by `@ai-ins/vite`, `@ai-ins/webpack`, `@ai-ins/nextjs`, and custom integrations.

> Most end users do not need to install this package directly.

## What it provides

- AI Ins client source generation,
- middleware creation for `__ai-ins`, `__ai-ins-agent`, and editor routes,
- built-in and custom agent provider resolution,
- proxy normalization and default provider selection.

## Common exports

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
