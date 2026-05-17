# ai-ins CLI

`ai-ins` 是 AI Ins 的项目接入 CLI，用来把 AI Ins 接到 Next.js、Vite 和 Webpack 项目里。

它会做两件事：

- 安装对应的 `@ai-ins/*` 包。
- 尝试改写 bundler 配置，把 AI Ins 接进去。

## 快速接入

单配置项目里，直接运行：

```bash
npx ai-ins
```

如果你已经知道 bundler，也可以显式指定：

```bash
npx ai-ins --bundler vite
npx ai-ins --bundler webpack
npx ai-ins --bundler nextjs
```

## 多配置文件项目

如果项目里有多个 Vite / Webpack 配置文件，不要直接运行裸的 `npx ai-ins`。

这种情况下必须显式指定目标配置文件：

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

`--config` 支持相对项目根目录的路径，也支持绝对路径。

当 CLI 检测到多个候选配置文件时，会直接停止并提示你传 `--config`，不会静默修改第一个文件。

## 常用命令

只改配置，不安装依赖：

```bash
npx ai-ins --no-install
```

强制安装最新版本：

```bash
npx ai-ins --force
```

在别的目录里执行：

```bash
npx ai-ins --cwd ./apps/web
```

显式写子命令也可以：

```bash
npx ai-ins init --bundler vite --config vite.config.ts
```

## 给 AI / Agent 的规则

如果用户说“帮我接入 ai-ins”，AI/Agent 应该按下面的顺序做：

1. 先识别项目使用的是 Next.js、Vite 还是 Webpack。
2. 再检查目标 app 目录里是否存在多个配置文件。
3. 单配置项目：优先运行 `npx ai-ins --bundler <bundler>`。
4. 多配置项目：必须运行 `npx ai-ins --bundler <bundler> --config <目标配置文件>`。
5. 如果 CLI 无法安全改写配置，不要猜测要改哪个文件，直接按下面的手动接入方式修改。

可以直接把这段话交给 AI：

```text
帮我在这个项目里接入 ai-ins。先判断 bundler；如果有多个配置文件，不要直接跑 npx ai-ins，而是使用 --bundler 和 --config 指定目标配置；如果 CLI 无法安全改写，就按 README 里的对应示例手动接入。
```

## 手动接入

### Vite

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

### Webpack

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

### Next.js

```ts
import { withAiIns } from '@ai-ins/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAiIns(nextConfig)
```

同时确保项目根目录有：

```ts
import '@ai-ins/nextjs/client'
```

通常放在 `instrumentation-client.ts` 或 `instrumentation-client.js`。

## 行为说明

- CLI 会根据 `packageManager` 字段或 lockfile 选择 `pnpm`、`yarn`、`bun` 或 `npm`。
- 如果对应依赖已经安装，默认跳过安装；传 `--force` 时会重新安装最新版。
- 如果检测到多个可能的 bundler，也会要求你显式传 `--bundler`。
- 如果配置结构过于特殊，CLI 会提示你手动修改，而不是强行写入。

完整文档见仓库根目录 README。