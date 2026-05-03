# ai-ins

AI Ins 是一个本地开发辅助工具。让你通过按住 `Option` / `Alt` 点选页面上的 DOM，打开 AI Ins 面板，把目标元素和修改要求一起交给本地 CLI Agent 执行，并在页面里持续查看任务输出。

macOS 按住 `Option + Cmd`，Windows / Linux 按住 `Ctrl + Alt` 点击页面元素会直接打开IDE，并跳转到源码位置。

<img width="1672" height="783" alt="859d26a9-c362-4ae8-a2ed-62a017dc214c" src="https://github.com/user-attachments/assets/b524667f-ff12-4874-a669-59a2ab97e572" />

## 当前能力

- 通过运行 `npx ai-ins init` 自动识别项目内的构建工具（Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件。
- Vite dev server 自动注入 AI Ins 客户端，支持 `Option` / `Alt` 点选 DOM 打开面板。
- 面板内可以选择 Agent、填写代理、提交修改要求，并并发跟踪多个运行任务。
- 内置 Codex 和 Claude CLI provider；Copilot 目前只是占位，需要通过自定义 provider 接入。
- macOS 下会优先使用正在运行的 VS Code / Zed / WebStorm / Cursor 等编辑器打开源码。

## 支持状态

| 包                   | 状态   | 说明                                                                                       |
| -------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `ai-ins`          | 可用   | 提供 `ai-ins` 命令，用于初始化项目配置。                                                |
| `@ai-ins/vite`    | 可用   | 主要支持路径，包含客户端注入和 React source 适配。                                         |
| `@ai-ins/webpack` | 可用   | 注册 devServer middleware，自动注入客户端脚本，并在开发态给 JSX DOM 元素注入 source 标记。 |
| `@ai-ins/core`    | 内部包 | 提供 middleware、Agent provider、客户端脚本生成等共享能力。                                |

<img width="1672" height="941" alt="0cdbd76e-12bf-4e21-a2f0-4f8335ba41bc" src="https://github.com/user-attachments/assets/48caed6e-019d-4aed-9965-01bba7de6232" />

## 快速接入

```bash
npx ai-ins init
```

指定构建工具：

```bash
npx ai-ins init --bundler vite
npx ai-ins init --bundler webpack
```

只改配置、不安装依赖：

```bash
npx ai-ins init --no-install
```

CLI 会根据 `packageManager` 或 lockfile 选择 `pnpm` / `yarn` / `bun` / `npm`。如果配置文件结构太特殊，CLI 会提示你手动把插件加入配置。

## Vite 使用方式

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import aiIns from '@ai-ins/vite' // <-- 引入插件

export default defineConfig({
  plugins: [
    aiIns(), // <-- 使用插件
    react()
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
AI_INS_PROXY=http://127.0.0.1:7890
AI_INS_CODEX_MODEL=gpt-5.5
```

代理解析优先级：插件配置 / provider 配置优先，其次读取 `AI_INS_PROXY`，再读取常见的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`，最后尝试读取 macOS / Windows 系统代理。

## 本仓库开发

```bash
pnpm install
pnpm dev:watch
pnpm dev:webpack
```

`pnpm dev:watch` 会同时 watch core、Vite 插件和 `examples/vite-react` playground。改 `packages/core/src/client/` 或 `packages/vite/src/index.ts` 后刷新浏览器即可。`pnpm dev` 仍然会先构建 core / Vite 插件，再启动 playground。

`pnpm dev:vite` 会同时启动 `examples/vite-react` 和 `examples/vite-vue3` 两个 Vite playground。

`pnpm dev:webpack` 会先构建 core / Webpack 插件，再同时 watch core、Webpack 插件和 `examples/webpack-react` playground。改 `packages/core/src/client/` 后刷新浏览器即可看到新的 AI Ins 面板 runtime；如果改的是 Webpack 插件初始化逻辑，重启 dev server 后生效。

常用检查：

```bash
pnpm typecheck
pnpm build
```

## 包结构

```txt
packages/cli       # ai-ins CLI 包，提供 ai-ins init
packages/core      # middleware、Agent provider、客户端 runtime
packages/vite      # Vite 插件
packages/webpack   # Webpack devServer 插件
examples/vite-react
examples/vite-vue3
```

## 常见问题

### 如何连接 codex的？

Codex Exec 是一种轻量级、非交互式的 CLI 模式，专门用于自动化任务、CI/CD 管道和单次脚本执行。它通过命令行直接接收提示，处理任务，生成流式结构化日志并退出。
