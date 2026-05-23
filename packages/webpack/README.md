# @ai-ins/webpack

`@ai-ins/webpack` 提供 AI Ins 的 Webpack 插件，用于在开发态注入客户端脚本、注册本地 middleware，并为 JSX / TSX 元素添加源码定位信息。

## 安装

```bash
pnpm add -D @ai-ins/webpack webpack webpack-dev-server
# or
npm install -D @ai-ins/webpack webpack webpack-dev-server
# or
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

也可以使用工厂函数：

```js
const { aiIns } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [aiIns()],
}
```

## 它会做什么

- 向 webpack dev server 注册 AI Ins middleware。
- 自动注入客户端入口脚本。
- 在开发态为 JSX / TSX 规则追加 source loader。
- 支持通过自定义 `clientPath` 暴露同一份客户端脚本。

## 配置示例

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  mode: 'development',
  devServer: {},
  plugins: [
    new AiInsWebpackPlugin({
      root: process.cwd(),
      clientPath: '/__custom-ai-ins/client.js',
      agents: {
        defaultProvider: 'claude',
      },
    }),
  ],
}
```

## 选项

`AiInsWebpackPluginOptions` = `AiInsPluginOptions` + `clientPath?`：

| 选项 | 说明 |
| --- | --- |
| `clientPath` | 额外暴露客户端脚本的路径，默认主路径为 `/__ai-ins/client.js`。 |
| `root` | 指定 AI Ins 允许访问的项目根目录，默认取 webpack compiler context。 |
| `proxy` | 为所有 Agent provider 设置统一代理。 |
| `disableSourceAttributes` | 关闭 JSX / TSX 源码定位属性注入。 |
| `agents.defaultProvider` | 设置面板默认 provider。 |
| `agents.providers` | 追加或覆盖内置 provider。 |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | 覆盖对应 CLI 的命令、模型与代理配置。 |

## 使用提示

- 插件仅在非 production 模式下向入口与 loader 链注入 AI Ins 能力。
- 如果你的配置里已经存在 JS / TS 规则，插件会尽量复用并在其后追加 source loader。
- 如果规则结构过于特殊，CLI 会提示手动接入而不是盲目改写。

## 相关文档

- [仓库总览](../../README.md)
- [CLI 文档](../cli/README.md)
- [Core API 文档](../core/README.md)
