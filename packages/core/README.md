# @ai-ins/core

[简体中文](./README.md) | [English](./README.en.md)

`@ai-ins/core` 是 AI Ins 的共享运行时与中间件集合，供 `@ai-ins/vite`、`@ai-ins/webpack`、`@ai-ins/nextjs` 以及自定义集成复用。

> 这个包主要面向框架适配层或二次集成使用，普通项目通常不需要直接安装它。

## 提供的能力

- 生成 AI Ins 客户端脚本。
- 创建 `__ai-ins`、`__ai-ins-agent`、`__open-in-editor` 等 middleware。
- 解析内置 / 自定义 Agent provider。
- 处理代理配置与默认 provider 选择。

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
