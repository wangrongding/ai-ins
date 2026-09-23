# @ai-ins/webpack

[简体中文](./README.md) | [English](./README.en.md)

`@ai-ins/webpack` 提供 AI Ins 的 Webpack 插件，用于在开发态注入客户端脚本、注册本地 middleware，并为 JSX / TSX 元素添加源码定位信息。

## 安装

```bash
pnpm add -D @ai-ins/webpack webpack webpack-dev-server
npm install -D @ai-ins/webpack webpack webpack-dev-server
yarn add -D @ai-ins/webpack webpack webpack-dev-server
```

## 最小示例

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

## 它会做什么

- 向 webpack dev server 注册 AI Ins middleware。
- 自动注入客户端入口脚本。
- 在开发态为 JSX / TSX 规则追加 source loader。
- 支持通过自定义 `clientPath` 暴露同一份客户端脚本。

## 选项

`AiInsWebpackPluginOptions` = `AiInsPluginOptions` + `clientPath?`：

| 选项 | 说明 |
| --- | --- |
| `clientPath` | 额外暴露客户端脚本的路径，默认主路径为 `/__ai-ins/client.js`。 |
| `root` | AI Ins 可访问的项目根目录，默认取 webpack compiler context。 |
| `proxy` | 所有 Agent provider 共用的代理。 |
| `disableSourceAttributes` | 关闭 JSX / TSX 源码定位属性注入。 |
| `agents.defaultProvider` | 设置面板默认 provider。 |
| `agents.providers` | 追加或覆盖内置 provider。 |
