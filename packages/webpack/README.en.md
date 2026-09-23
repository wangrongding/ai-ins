# @ai-ins/webpack

[Simplified Chinese](./README.md) | [English](./README.en.md)

`@ai-ins/webpack` is the Webpack plugin for AI Ins. It injects the client during development, registers middleware routes, and adds source metadata to JSX / TSX elements.

## Install

```bash
pnpm add -D @ai-ins/webpack webpack webpack-dev-server
npm install -D @ai-ins/webpack webpack webpack-dev-server
yarn add -D @ai-ins/webpack webpack webpack-dev-server
```

## Minimal example

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

## What it does

- registers AI Ins middleware on webpack dev server,
- injects the client entry automatically,
- appends the source loader to JSX / TSX rules in development,
- optionally exposes the same client from a custom `clientPath`.

## Options

`AiInsWebpackPluginOptions` = `AiInsPluginOptions` + `clientPath?`.

| Option | Description |
| --- | --- |
| `clientPath` | Extra path that serves the client script. The default path is `/__ai-ins/client.js`. |
| `root` | Project root AI Ins may inspect. Defaults to webpack compiler context. |
| `proxy` | Shared proxy for all providers. |
| `disableSourceAttributes` | Disable JSX / TSX source metadata injection. |
| `agents.defaultProvider` | Default provider selected in the panel. |
| `agents.providers` | Add or override built-in providers. |
