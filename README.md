# ai-ins

[简体中文](./README.md) | [English](./README.en.md)

AI Ins 是一个本地开发辅助工具，让你在开发 Web / Electron 等项目时无需离开项目窗口，就能直接选中页面元素、把修改需求交给本地 CLI Agent，并在页面里持续查看任务输出。

有点像“忒修斯之船”，逐渐迭代自己。

- 不用来回找文件。
- 不用复制组件路径。
- 不用描述“帮我修改 xxx 模块、xxx 按钮...”。
- 接手陌生项目时，可以直接从页面选中元素，快速定位源码并开始修改。
- 通过在页面中选取元素，调度 codex cli、claude code cli、copilot cli 等本地 Agent CLI，只要你本地已经配置好任意一个即可。

本地开发环境下，这里假装自己在开发一个 X 平台，可以参考这个示例操作视频（面板仍在持续迭代）：

https://github.com/user-attachments/assets/f909f905-3297-49da-8881-8b48689c015c

## 文档导航

- [仓库总览（中文）](./README.md)
- [Repository overview (English)](./README.en.md)
- [CLI 文档（中文）](./packages/cli/README.md)
- [CLI docs (English)](./packages/cli/README.en.md)
- [Vite 插件文档（中文）](./packages/vite/README.md)
- [Vite plugin docs (English)](./packages/vite/README.en.md)
- [Webpack 插件文档（中文）](./packages/webpack/README.md)
- [Webpack plugin docs (English)](./packages/webpack/README.en.md)
- [Next.js 插件文档（中文）](./packages/nextjs/README.md)
- [Next.js plugin docs (English)](./packages/nextjs/README.en.md)
- [Core API 文档（中文）](./packages/core/README.md)
- [Core API docs (English)](./packages/core/README.en.md)

## 快速接入

你可以直接跟你的 Agent 说：“帮我接入 ai-ins”，它会自动帮你接入。

如果你担心 Agent 不够智能，也可以说：“参考 https://github.com/wangrongding/ai-ins/blob/main/README.md ，帮我接入 ai-ins”。

### 命令行快捷接入

单配置的 Web 或 Electron 项目里，可以直接运行下面的命令。CLI 会自动识别项目内的构建工具（Vite / Webpack / Next.js），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件：

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

<img width="1600" alt="ai-ins-panel" src="https://github.com/user-attachments/assets/8a896580-a951-4694-a8c6-9fab977a37eb" />

并且在 macOS 按住 `Option + Cmd`，Windows / Linux 按住 `Ctrl + Alt` 点击页面元素，也支持直接打开 IDE 并跳转到源码位置，用以查看修改细节或者手动调整。

<img width="1600" alt="open-in-editor" src="https://github.com/user-attachments/assets/b524667f-ff12-4874-a669-59a2ab97e572" />

## 当前能力

- 通过运行 `npx ai-ins` 自动识别项目内的构建工具（Next.js / Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件。
- 支持通过 `--config <path>` 指定目标配置文件，适合多 Vite 配置、多 Webpack 配置或非标准文件名场景。
- 在检测到多个候选配置文件或多个可能的 bundler 时，CLI 会直接要求你显式指定，而不是静默修改第一个匹配项。
- Vite dev server 自动注入 AI Ins 客户端，支持 `Option` / `Alt` 点选 DOM 打开面板。
- 面板内可以选择 Agent、填写代理、提交修改要求，并并发跟踪多个运行任务。
- 内置 Codex、Claude、Copilot、Gemini 和 Cursor CLI provider。
- macOS 下会优先使用正在运行的 VS Code / Zed / WebStorm / Cursor 等编辑器打开源码。

## 支持状态

| 包 | 状态 | 说明 |
| --- | --- | --- |
| `ai-ins` | 可用 | 提供 `ai-ins` 命令，用于初始化项目配置。 |
| `@ai-ins/vite` | 可用 | Vite 插件，包含客户端注入和 React / Vue / SolidJS / Svelte source 适配。 |
| `@ai-ins/webpack` | 可用 | Webpack devServer 插件，自动注入客户端脚本，并在开发态给 JSX DOM 元素注入 source 标记。 |
| `@ai-ins/nextjs` | 可用 | Next.js 适配，支持 Webpack / Turbopack JSX source 标记和 middleware 转发。 |
| `@ai-ins/core` | 内部包 | 提供 middleware、Agent provider、客户端脚本生成等共享能力。 |

## 高级用法

```bash
npx ai-ins --bundler vite
npx ai-ins --bundler webpack
npx ai-ins --bundler nextjs
npx ai-ins --no-install
npx ai-ins --force
```

如果你已经用 `--config` 明确传入了类似 `vite.config.ts` 或 `webpack.dev.js` 这样的文件名，CLI 会先按文件名推断 bundler；如果文件名本身不够明确，仍然建议同时传 `--bundler`。

## 给 AI / Agent 的接入规则

如果你是 AI Agent，用户说“帮我接入 ai-ins”时，优先按下面的顺序执行：

1. 先识别项目使用的是 Next.js、Vite 还是 Webpack。
2. 先检查要接入的 app/包目录里是否存在多个 bundler 配置文件。
3. 单配置项目：优先运行 `npx ai-ins --bundler <bundler>`。
4. 多配置项目：必须运行 `npx ai-ins --bundler <bundler> --config <目标配置文件>`，不要直接运行裸的 `npx ai-ins`。
5. 如果 CLI 无法安全修改配置，就按对应 bundler 示例手动接入，不要猜测应该改哪一个文件。
6. 对 Vite 项目，把 `aiIns()` 放在 React / Vue / Svelte 等框架插件前面。
7. 对 Next.js 项目，除了更新 `next.config.*` 之外，还要确保 `instrumentation-client.ts` 或 `instrumentation-client.js` 引入 `@ai-ins/nextjs/client`。

## Agent 配置

内置 provider 包括 `codex`、`claude`、`copilot`、`gemini` 和 `cursor`。

默认 provider：

```ts
aiIns({
  agents: {
    defaultProvider: 'codex',
  },
})
```

环境变量：

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

## 本仓库开发

```bash
pnpm install
pnpm dev:watch
pnpm dev:nextjs
pnpm dev:webpack
pnpm typecheck
pnpm build
```

## 包结构

```txt
packages/cli       # ai-ins CLI 包
packages/core      # middleware、Agent provider、客户端 runtime
packages/vite      # Vite 插件
packages/webpack   # Webpack devServer 插件
packages/nextjs    # Next.js 插件
examples/ai-ins-panel-react
examples/vite-react
examples/vite-vue3
examples/vite-solidjs
examples/vite-svelte
examples/nextjs-react
examples/webpack-react
```
