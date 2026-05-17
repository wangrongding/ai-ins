# ai-ins

AI Ins 是一个本地开发辅助工具，让你在开发web/electron等项目的时候无需离开项目窗口，在项目内编写项目。

- 不用来回找文件。
- 不用复制组件路径。
- 不用描述“xxx模块，xxx按钮...”。
- 接手陌生项目，直接快速上手修改。不再需要花时间熟悉项目结构、查找相关代码位置。

## 快速接入

单配置的 web 或 electron 项目里，可以直接运行下面的命令。CLI 会自动识别项目内的构建工具（Vite / Webpack / Next.js），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件：

```bash
npx ai-ins
```

如果项目里有多个 Vite / Webpack 配置文件，或者你明确知道要改哪一个配置文件，建议从一开始就显式指定：

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

`--config` 支持相对项目根目录的路径，也支持绝对路径。CLI 在检测到多个候选配置文件时会直接停止，并提示你使用 `--config`，不会再盲猜要改哪个文件。

你只需要：按住 `Option` / `Alt` 点选页面上的 DOM，通过打开的内置 AI Ins 面板，把目标元素和修改要求一起交给本地 CLI Agent 执行，并在页面里持续查看任务输出，任务完成后通过热更新直接看到修改结果即可。

https://github.com/user-attachments/assets/f909f905-3297-49da-8881-8b48689c015c

并且在 macOS 按住 `Option + Cmd`，Windows / Linux 按住 `Ctrl + Alt` 点击页面元素也支持直接打开IDE，并跳转到源码位置，用以查看修改细节或者手动调整。

<img width="1600" alt="859d26a9-c362-4ae8-a2ed-62a017dc214c" src="https://github.com/user-attachments/assets/b524667f-ff12-4874-a669-59a2ab97e572" />

## 当前能力

- 通过运行 `npx ai-ins` 自动识别项目内的构建工具（Next.js / Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件。
- 支持通过 `--config <path>` 指定目标配置文件，适合多 Vite 配置、多 Webpack 配置或非标准文件名场景。
- 在检测到多个候选配置文件或多个可能的 bundler 时，CLI 会直接要求你显式指定，而不是静默修改第一个匹配项。
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

指定目标配置文件：

```bash
npx ai-ins --config vite.config.ts
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

如果你已经用 `--config` 明确传入了类似 `vite.config.ts` 或 `webpack.dev.js` 这样的文件名，CLI 会先按文件名推断 bundler；如果文件名本身不够明确，仍然建议同时传 `--bundler`。

只改配置、不安装依赖：

```bash
npx ai-ins --no-install
```

强制重新安装最新的适配包：

```bash
npx ai-ins --force
```

不带子命令时，CLI 会默认执行初始化逻辑；显式写 `npx ai-ins init` 也仍然支持，后续新增的其它子命令会继续通过 `ai-ins <command>` 调用。CLI 会根据 `packageManager` 或 lockfile 选择 `pnpm` / `yarn` / `bun` / `npm`。如果项目已经安装过对应依赖，默认会跳过安装；加上 `--force` 时会重新安装最新版，例如 Vite 项目会安装 `@ai-ins/vite@latest`。如果检测到多个可能的 bundler、多个候选配置文件，或者配置文件结构太特殊，CLI 会提示你显式指定 `--bundler` / `--config`，或者手动把插件加入配置。

## 给 AI / Agent 的接入规则

如果你是 AI agent，用户说“帮我接入 ai-ins”时，优先按下面的顺序执行：

1. 先识别项目使用的是 Next.js、Vite 还是 Webpack。
2. 先检查要接入的 app/包目录里是否存在多个 bundler 配置文件。
3. 单配置项目：优先运行 `npx ai-ins --bundler <bundler>`。
4. 多配置项目：必须运行 `npx ai-ins --bundler <bundler> --config <目标配置文件>`，不要直接运行裸的 `npx ai-ins`。
5. 如果 CLI 无法安全修改配置，就按下面的 bundler 示例手动接入，不要猜测应该改哪一个文件。
6. 对 Vite 项目，把 `aiIns()` 放在 React / Vue / Svelte 等框架插件前面。
7. 对 Next.js 项目，除了更新 `next.config.*` 之外，还要确保 `instrumentation-client.ts` 或 `instrumentation-client.js` 引入 `@ai-ins/nextjs/client`。

你也可以直接把下面这段话交给 AI：

```text
帮我在这个项目里接入 ai-ins。先判断 bundler；如果有多个配置文件，不要直接跑 npx ai-ins，而是使用 --bundler 和 --config 指定目标配置；如果 CLI 无法安全改写，就按 README 里的对应示例手动接入。
```

## 多配置文件项目

对单配置项目，`npx ai-ins` 依然是最快的入口。

对下面这些场景，推荐直接使用 `--config`：

- 一个仓库里有多个 Vite app，各自有自己的 `vite.config.*`。
- Electron、SSR、微前端项目里同时存在 `vite.config.ts`、`vite.renderer.config.ts`、`vite.main.config.ts`。
- Webpack 项目里同时存在 `webpack.config.js`、`webpack.dev.js`、`webpack.prod.js`。
- 你知道 dev server 实际读取的是某个特定配置文件，而不是根目录默认文件名。

典型命令：

```bash
# Vite
npx ai-ins --bundler vite --config vite.config.ts
npx ai-ins --bundler vite --config apps/admin/vite.config.ts

# Webpack
npx ai-ins --bundler webpack --config webpack.dev.js
npx ai-ins --bundler webpack --config build/webpack.renderer.config.js
```

## Vite 使用方式

如果 CLI 无法自动修改，或者你更希望手动接入，可以直接按下面的方式配置：

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
- 面板内默认 `⌘ + Enter`（Windows / Linux 为 `Ctrl + Enter`）提交，也可切到 `Enter` 提交。
- 关闭面板不会中断已启动的 Agent 任务，任务会继续在侧边列表里更新。

## Webpack 使用方式

如果 CLI 无法自动修改，或者你需要手动接入某个特定的 Webpack 配置文件，可以直接按下面的方式配置：

```js
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {},
  plugins: [new AiInsWebpackPlugin()],
}
```

Webpack 插件会在开发构建中自动注入客户端脚本，并通过 pre-loader 给 JSX DOM 元素注入 source 标记。

## Next.js 使用方式

如果 CLI 无法自动修改，或者你希望手动接入，可以直接按下面的方式配置：

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

内置 provider 包括 `codex`、`claude`、`copilot`、`gemini` 和 `cursor`。Gemini CLI 官方 headless 模式支持 stdin 与 JSON 输出；Cursor Agent CLI 官方建议在非交互场景使用 `--print --output-format stream-json`，AI Ins 会按这两个 CLI 的结构化输出做实时展示。

默认 provider：

```ts
aiIns({
  agents: {
    defaultProvider: 'codex',
  },
})
```

切换到 Gemini CLI：

```ts
aiIns({
  agents: {
    defaultProvider: 'gemini',
  },
  gemini: {
    model: 'gemini-2.5-flash',
  },
})
```

切换到 Cursor Agent CLI：

```ts
aiIns({
  agents: {
    defaultProvider: 'cursor',
  },
  cursor: {
    model: 'gpt-5',
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
- `output`：`codex-json`、`json`、`jsonl` 或 `plain`，用于解析输出流。
- `proxy`：单个 provider 的代理配置。

## 环境变量

```bash
CODEX_CLI=codex
CLAUDE_CLI=claude
COPILOT_CLI=copilot
GEMINI_CLI=gemini
CURSOR_AGENT_CLI=cursor-agent
AI_INS_PROXY=http://127.0.0.1:7890
AI_INS_CODEX_MODEL=gpt-5.5
AI_INS_CLAUDE_MODEL=sonnet
AI_INS_COPILOT_MODEL=gpt-5.2
AI_INS_GEMINI_MODEL=gemini-2.5-flash
AI_INS_CURSOR_MODEL=gpt-5
```

代理解析优先级：插件配置 / provider 配置优先，其次读取 `AI_INS_PROXY`，再读取常见的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`，最后尝试读取 macOS / Windows 系统代理。

跨平台命令解析会优先使用 `PATH` 中的可执行文件；Windows 下会优先选择 `.cmd` / `.bat` 等 npm 或原生命令 shim，因此只要 Codex、Claude、Copilot、Gemini 或 Cursor CLI 的安装目录已加入 `PATH`，macOS 和 Windows 都可以使用同一套配置。

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
