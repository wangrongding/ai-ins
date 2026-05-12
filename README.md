# ai-ins

AI Ins 是一个本地开发辅助工具，让你在开发web/electron等项目的时候无需离开项目窗口，在项目内编写项目。

- 不用来回找文件。
- 不用复制组件路径。
- 不用描述“xxx模块，xxx按钮...”。
- 接手陌生项目，直接快速上手修改。不再需要花时间熟悉项目结构、查找相关代码位置。

## 快速接入

在 web 或 electron 项目里运行下面的命令，CLI 会自动识别项目内的构建工具（Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件：

```bash
npx ai-ins
```

你只需要：按住 `Option` / `Alt` 点选页面上的 DOM，通过打开的内置 AI Ins 面板，把目标元素和修改要求一起交给本地 CLI Agent 执行，并在页面里持续查看任务输出，任务完成后通过热更新直接看到修改结果即可。

https://github.com/user-attachments/assets/f909f905-3297-49da-8881-8b48689c015c

并且在 macOS 按住 `Option + Cmd`，Windows / Linux 按住 `Ctrl + Alt` 点击页面元素也支持直接打开IDE，并跳转到源码位置，用以查看修改细节或者手动调整。

<img width="1600" alt="859d26a9-c362-4ae8-a2ed-62a017dc214c" src="https://github.com/user-attachments/assets/b524667f-ff12-4874-a669-59a2ab97e572" />

## 当前能力

- 通过运行 `npx ai-ins` 自动识别项目内的构建工具（Next.js / Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件。
- Vite dev server 自动注入 AI Ins 客户端，支持 `Option` / `Alt` 点选 DOM 打开面板。
- 面板内可以选择 Agent、填写代理、提交修改要求，并并发跟踪多个运行任务。
- 内置 Codex、Claude 和 Copilot CLI provider。
- macOS 下会优先使用正在运行的 VS Code / Zed / WebStorm / Cursor 等编辑器打开源码。

## 支持状态

| 包                | 状态   | 说明                                                                                       |
| ----------------- | ------ | ------------------------------------------------------------------------------------------ |
| `ai-ins`          | 可用   | 提供 `ai-ins` 命令，用于初始化项目配置。                                                   |
| `@ai-ins/vite`    | 可用   | 主要支持路径，包含客户端注入和 React / Vue / SolidJS / Svelte source 适配。                |
| `@ai-ins/webpack` | 可用   | 注册 devServer middleware，自动注入客户端脚本，并在开发态给 JSX DOM 元素注入 source 标记。 |
| `@ai-ins/nextjs`  | 可用   | 支持 Next.js dev server，包含 Webpack / Turbopack JSX source 标记和 middleware 转发。       |
| `@ai-ins/core`    | 内部包 | 提供 middleware、Agent provider、客户端脚本生成等共享能力。                                |

<img width="1600" alt="image" src="https://github.com/user-attachments/assets/c157f619-34ad-45e2-b2e8-b5d04e4d92ee" />

## 高级用法

```bash
# 接入
npx ai-ins
```

指定构建工具：

```bash
npx ai-ins --bundler vite
npx ai-ins --bundler webpack
npx ai-ins --bundler nextjs
```

只改配置、不安装依赖：

```bash
npx ai-ins --no-install
```

强制重新安装最新的适配包：

```bash
npx ai-ins --force
```

不带子命令时，CLI 会默认执行初始化逻辑；显式写 `npx ai-ins init` 也仍然支持，后续新增的其它子命令会继续通过 `ai-ins <command>` 调用。CLI 会根据 `packageManager` 或 lockfile 选择 `pnpm` / `yarn` / `bun` / `npm`。如果项目已经安装过对应依赖，默认会跳过安装；加上 `--force` 时会重新安装最新版，例如 Vite 项目会安装 `@ai-ins/vite@latest`。如果配置文件结构太特殊，CLI 会提示你手动把插件加入配置。

## Vite 使用方式

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import aiIns from '@ai-ins/vite' // <-- 引入插件

export default defineConfig({
  plugins: [
    aiIns(), // <-- 使用插件
    react(),
  ],
})
```

`aiIns()` 需要放在 React/Vue/Svelte 等框架插件前面，这样开发态 source 标记会在框架编译 JSX / template 前注入。

启动 dev server 后：

- `Option` / `Alt` + 点击页面元素：打开 AI Ins 面板并选中目标。
- macOS `Option + Cmd`，Windows / Linux `Ctrl + Alt` + 点击页面元素：在编辑器里打开源码位置。
- 面板内 `Shift + Enter`：提交当前修改要求。
- 关闭面板不会中断已启动的 Agent 任务，任务会继续在侧边列表里更新。

## Webpack 使用方式

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

Webpack 插件会在开发构建中自动注入客户端脚本，并通过 pre-loader 给 JSX DOM 元素注入 source 标记。

## Next.js 使用方式

```ts
import { withAiIns } from '@ai-ins/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAiIns(nextConfig)
```

同时在项目根目录添加或更新 `instrumentation-client.ts`：

```ts
import '@ai-ins/nextjs/client'
```

Next.js 适配会在开发态启动本地 AI Ins middleware 服务，并通过 `rewrites()` 转发 `__ai-ins` 相关请求。Webpack dev server 会通过 `webpack()` hook 注入 source loader；Turbopack dev server 会通过 `turbopack.rules` 使用同一个 loader。

## Agent 配置

默认 provider：

```ts
aiIns({
  agents: {
    defaultProvider: 'codex',
  },
})
```

自定义 provider：

```ts
aiIns({
  agents: {
    defaultProvider: 'my-agent',
    providers: [
      {
        id: 'my-agent',
        label: 'My Agent',
        command: 'my-agent',
        args: ['run', '--json'],
        input: 'stdin',
        output: 'plain',
      },
    ],
  },
})
```

Provider 字段说明：

- `command`：本地可执行命令。
- `args`：启动参数。
- `input`：`stdin` 或 `argument`，表示 prompt 通过标准输入还是命令参数传入。
- `output`：`codex-json`、`jsonl` 或 `plain`，用于解析输出流。
- `proxy`：单个 provider 的代理配置。

## 环境变量

```bash
CODEX_CLI=codex
CLAUDE_CLI=claude
COPILOT_CLI=copilot
AI_INS_PROXY=http://127.0.0.1:7890
AI_INS_CODEX_MODEL=gpt-5.5
AI_INS_CLAUDE_MODEL=sonnet
AI_INS_COPILOT_MODEL=gpt-5.2
```

代理解析优先级：插件配置 / provider 配置优先，其次读取 `AI_INS_PROXY`，再读取常见的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`，最后尝试读取 macOS / Windows 系统代理。

## 本仓库开发

```bash
pnpm install
pnpm dev:watch
pnpm dev:nextjs
pnpm dev:webpack
```

`pnpm dev:watch` 会同时 watch core、Vite 插件和 `examples/vite-react` playground。改 `packages/core/src/client/` 或 `packages/vite/src/index.ts` 后刷新浏览器即可。`pnpm dev` 仍然会先构建 core / Vite 插件，再启动 playground。

`pnpm dev:vite` 会同时启动 `examples/vite-react`、`examples/vite-vue3`、`examples/vite-solidjs` 和 `examples/vite-svelte` 四个 Vite playground。

`pnpm dev:nextjs` 会先构建 core / Next.js 插件，再启动 `examples/nextjs-react` playground，默认使用 Turbopack。需要走 Webpack dev server 时可以运行 `pnpm dev:nextjs:webpack`。

`pnpm dev:webpack` 会先构建 core / Webpack 插件，再同时 watch core、Webpack 插件和 `examples/webpack-react` playground。改 `packages/core/src/client/` 后刷新浏览器即可看到新的 AI Ins 面板 runtime；如果改的是 Webpack 插件初始化逻辑，重启 dev server 后生效。

常用检查：

```bash
pnpm typecheck
pnpm build
```

## 包结构

```txt
packages/cli       # ai-ins CLI 包，默认提供 init 初始化逻辑
packages/core      # middleware、Agent provider、客户端 runtime
packages/vite      # Vite 插件
packages/webpack   # Webpack devServer 插件
packages/nextjs    # Next.js 插件，支持 Webpack / Turbopack dev server
examples/vite-react
examples/vite-vue3
examples/vite-solidjs
examples/vite-svelte
examples/nextjs-react
```

## 常见问题

### 如何连接 codex的？

Codex Exec 是一种轻量级、非交互式的 CLI 模式，专门用于自动化任务、CI/CD 管道和单次脚本执行。它通过命令行直接接收提示，处理任务，生成流式结构化日志并退出。
