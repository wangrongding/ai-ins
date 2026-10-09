# ai-ins

AI Ins 是一个本地开发辅助工具，让你在开发 web/electron 等项目的时候无需离开项目窗口，在项目内编写项目。

有点像 “忒修斯之船”，逐渐迭代自己；

- 不用来回找文件。
- 不用复制组件路径。
- 不用描述“帮我修改xxx模块，xxx按钮...”。
- 接手陌生项目，直接快速上手修改。不再需要花时间熟悉项目结构、查找相关代码位置。
- 通过在页面中选取元素，调度 codex cli，claude code cli，copilot cli等等帮你修改，只要你本地任意一个配置好的 cli 工具即可

本地的开发环境下，这里假装自己在开发一个 x 平台，可以参考这个示例操作视频（面板仍在迭代好用的功能）：  

https://github.com/user-attachments/assets/f909f905-3297-49da-8881-8b48689c015c 

## 快速接入

你可以直接跟你的 agent 说： “帮我接入 ai-ins” ， 他会自动帮你接入。  

或者你担心 agent 不够智能，可以说：“参考 https://github.com/wangrongding/ai-ins/blob/main/README.md ，帮我接入 ai-ins”

### 命令行快捷接入

单配置的 web 或 electron 项目里，可以直接运行下面的命令。CLI 会自动识别项目内的构建工具（Vite / Webpack / Next.js / Astro），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件：

```bash
# 只需要一行即可快速接入：
npx ai-ins
```

如果项目里有多个 Vite / Webpack 配置文件，或者你明确知道要改哪一个配置文件，建议从一开始就显式指定：

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

`--config` 支持相对项目根目录的路径，也支持绝对路径。CLI 在检测到多个候选配置文件时会直接停止，并提示你使用 `--config`，不会再盲猜要改哪个文件。

你只需要：按住 `Option` / `Alt` 点选页面上的 DOM，通过打开的内置 AI Ins 面板，把目标元素和修改要求一起交给本地 CLI Agent 执行，并在页面里持续查看任务输出，任务完成后通过热更新直接看到修改结果即可。 

<img width="1600" alt="fcc1e26cb5b83666fe302510205b9d54" src="https://github.com/user-attachments/assets/8a896580-a951-4694-a8c6-9fab977a37eb" />

并且在 macOS 按住 `Option + Cmd`，Windows / Linux 按住 `Ctrl + Alt` 点击页面元素也支持直接打开IDE，并跳转到源码位置，用以查看修改细节或者手动调整。

<img width="1600" alt="859d26a9-c362-4ae8-a2ed-62a017dc214c" src="https://github.com/user-attachments/assets/b524667f-ff12-4874-a669-59a2ab97e572" />

## 当前能力

- 通过运行 `npx ai-ins` 自动识别项目内的构建工具（Next.js / Vite / Webpack...），安装对应的 `@ai-ins/*` 包，并尝试修改配置文件。
- 支持通过 `--config <path>` 指定目标配置文件，适合多 Vite 配置、多 Webpack 配置或非标准文件名场景。
- 在检测到多个候选配置文件或多个可能的 bundler 时，CLI 会直接要求你显式指定，而不是静默修改第一个匹配项。
- Vite dev server 自动注入 AI Ins 客户端，支持 `Option` / `Alt` 点选 DOM 打开面板。
- 面板内可以选择 Agent、填写代理、提交修改要求，并并发跟踪多个运行任务。
- 面板是对话式的：左侧是历史会话，**点哪条就接着哪条的 Agent 会话继续追问**（多轮对话），Agent 保留上一轮的上下文和它自己改过的代码；`Option` / `Alt` 点选页面元素则总是开一个新会话。
- 任务历史落盘到 `.ai-ins/runs/`，刷新页面或重启 dev server 后仍可查看、搜索和继续。
- 面板支持 10 种界面语言（默认跟随浏览器，不支持的语言回退到英文，也可以在设置里固定）：English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português (Brasil)、Русский。
- 内置 Codex、Claude 和 Copilot CLI provider。
- macOS 下会优先使用正在运行的 VS Code / Zed / WebStorm / Cursor 等编辑器打开源码。

## 支持状态

| 包                | 状态   | 说明                                                                                       |
| ----------------- | ------ | ------------------------------------------------------------------------------------------ |
| `ai-ins`          | 可用   | 提供 `ai-ins` 命令，用于初始化项目配置。                                                   |
| `@ai-ins/vite`    | 可用   | 主要支持路径，包含客户端注入和 React / Vue / SolidJS / Svelte source 适配。                |
| `@ai-ins/webpack` | 可用   | 注册 devServer middleware，自动注入客户端脚本，并在开发态给 JSX DOM 元素注入 source 标记。 |
| `@ai-ins/nextjs`  | 可用   | 支持 Next.js dev server，包含 Webpack / Turbopack JSX source 标记和 middleware 转发。       |
| `@ai-ins/astro`   | 可用   | Astro integration，dev 下自动注入客户端，支持 `.astro` 模板与 React / Vue / Svelte 岛屿定位。 |
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
npx ai-ins --bundler astro
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

1. 先识别项目使用的是 Astro、Next.js、Vite 还是 Webpack（Astro 项目即使装了 vite 也按 Astro 处理）。
2. 先检查要接入的 app/包目录里是否存在多个 bundler 配置文件。
3. 单配置项目：优先运行 `npx ai-ins --bundler <bundler>`。
4. 多配置项目：必须运行 `npx ai-ins --bundler <bundler> --config <目标配置文件>`，不要直接运行裸的 `npx ai-ins`。
5. 如果 CLI 无法安全修改配置，就按下面的 bundler 示例手动接入，不要猜测应该改哪一个文件。
6. 对 Vite 项目，把 `aiIns()` 放在 React / Vue / Svelte 等框架插件前面。
7. 对 Next.js 项目，除了更新 `next.config.*` 之外，还要确保 `instrumentation-client.ts` 或 `instrumentation-client.js` 引入 `@ai-ins/nextjs/client`。
8. 对 Astro 项目，安装 `@ai-ins/astro` 并加到 `astro.config.*` 的 `integrations` 里，不要再单独接 `@ai-ins/vite`。

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

## Astro 使用方式

`npx ai-ins` 会自动识别 Astro 项目（有 `astro` 依赖或 `astro.config.*`），安装 `@ai-ins/astro` 并把它加到 `integrations` 里。也可以用 Astro 自己的方式接入：

```bash
npx astro add @ai-ins/astro
```

或者手动配置：

```ts
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import aiIns from '@ai-ins/astro' // <-- 引入 integration

export default defineConfig({
  integrations: [
    react(),
    aiIns(), // <-- 使用 integration，参数与 @ai-ins/vite 相同
  ],
})
```

- 只在 `astro dev` 下生效：自动挂载 AI Ins middleware，并通过页面脚本注入客户端；`astro build` / `astro preview` 的产物不包含任何 AI Ins 代码。
- `.astro` 模板里的元素会在 Astro 编译前注入 source 标记，点选后定位到对应 `.astro` 文件的开始标签；`<script>` / `<style>` / `<slot>` 等不会被改动。
- React / Vue / Svelte 岛屿组件沿用 `@ai-ins/vite` 的 source 注入，照常定位到 `.tsx` / `.vue` / `.svelte`。
- 支持 Astro 4 / 5 / 6 / 7，不依赖 Astro dev toolbar 是否开启。

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
- `session`：多轮续跑声明，见下方「多轮会话」。不填则该 provider 只能单轮。

### 多轮会话（继续这条任务）

面板右侧是对话视图：你发的每一轮需求显示为消息气泡，Agent 的回复包在卡片里（较早轮次的长回复默认折叠）。交互规则只有两条：

- **点左侧历史会话 = 在这条会话里继续**。下一次提交不会新开一个 Agent，而是 resume 它原来的会话，所以 Agent 记得上一轮说过什么、改过哪些文件。会话还在跑、或者不能续跑时，输入框会说明原因并禁用，不会悄悄变成新会话。
- **`Option` / `Alt` 点选页面元素 = 开新会话**。如果你其实是想让刚才那条会话接着改这个新元素，输入框上方会有「改为在 X 里继续」的入口。

- 续跑轮**不会重发源码摘录**，除非你通过「改为在 X 里继续」把焦点切到了新元素——那时才会带上新元素的 source stack 和代码片段，并在 prompt 里注明焦点变更。
- 续跑轮固定用发起这条任务的 Agent，面板会锁住 Agent 选择器；想换 Agent 请点「改为新任务」。
- 任务还在跑、或者没拿到会话 id 时，面板会说明原因并保持禁用，不会悄悄退化成一个没有上下文的新会话。

各 provider 的会话能力（`sessionMode`）：

| provider  | sessionMode | 机制                                                          | 验证 |
| --------- | ----------- | ------------------------------------------------------------- | ---- |
| `codex`   | `capture`   | 从 `thread.started` 事件读 `thread_id`，续跑走 `exec resume`   | 本地实测通过 |
| `claude`  | `assign`    | 首轮用 `--session-id` 指定 uuid，续跑走 `--resume`             | 本地实测通过 |
| `copilot` | `assign`    | 首轮用 `--session-id` 指定 uuid，续跑走 `--resume`             | 本地实测通过 |
| `cursor`  | `capture`   | 从 stream-json 读会话 id，续跑走 `--resume`                    | 按官方文档实现，未本地实测 |
| `gemini`  | `none`      | 非交互模式没有可用的 resume 入口，保持单轮                     | —    |

续跑依赖 Agent CLI 把会话写到磁盘，所以默认不再传 codex 的 `--ephemeral` 和 claude 的 `--no-session-persistence`。如果你不想让会话落盘，可以整体关掉：

```ts
aiIns({
  agents: {
    // 关掉之后所有 provider 的 sessionMode 都变成 none，面板不再提供「继续」。
    sessions: false,
  },
})
```

自定义 provider 想支持续跑，加一段 `session` 声明即可（`{sessionId}` 会被替换成实际会话 id）：

```ts
aiIns({
  agents: {
    providers: [
      {
        id: 'my-agent',
        command: 'my-agent',
        args: ['run', '--json'],
        input: 'stdin',
        output: 'jsonl',
        session: {
          // 'assign'：我们生成 id 用 assignArgs 传进去；'capture'：从输出里读 sessionIdKeys。
          mode: 'assign',
          assignArgs: ['--session-id', '{sessionId}'],
          resumeArgs: ['run', '--json', '--resume', '{sessionId}'],
          resumeInput: 'stdin',
        },
      },
    ],
  },
})
```

> 覆盖了内置 provider 的 `args` 却没有重新声明 `session` 时，续跑会自动关闭——因为原来的 resume 命令行未必还能配上你的新命令。

### 权限

Agent 在面板里是以非交互模式运行的，它没法像在终端里那样弹出「是否允许」让你确认。面板右上角的设置里可以选三档权限：

| 档位 | 行为 |
| --- | --- |
| **询问我**（默认） | 自动允许编辑文件；其他需要授权的操作（执行命令、调用 MCP 工具等）会在对话里出现授权卡片，可以选「允许 / 本会话一直允许 / 拒绝」。 |
| **自动编辑** | 自动允许编辑文件；其他需要授权的操作直接拒绝。 |
| **完全访问** | 不再询问，Agent 可以执行任何命令和工具。只在你信任的项目里使用。 |

- 「询问我」目前只有 Claude 支持：AI Ins 通过 `--permission-prompt-tool` 接入一个自带的 MCP 桥，把授权请求转到面板里，等你选择后再交回给 Claude。
- Codex 的非交互模式没法暂停等待授权，选「询问我」时按「自动编辑」（`workspace-write` 沙箱）运行，「完全访问」对应 `--dangerously-bypass-approvals-and-sandbox`。Copilot 的权限由它自己的启动参数决定（默认 `--allow-all-tools`）。
- 不支持的档位只会退到更严格的一档，不会悄悄放宽；面板设置里会说明当前 Agent 实际按哪一档运行。
- 授权的结果会记在对话里，用「完全访问」跑的轮次会单独标出来。

自定义 provider 可以用 `permissions` 声明每一档的参数，它们会被插入到 `args` / `session.resumeArgs` 里 `{permissionArgs}` 所在的位置（没有占位符时追加到末尾），没声明的档位视为不支持：

```ts
{
  id: 'my-agent',
  args: ['run', '{permissionArgs}', '--json'],
  permissions: {
    edit: ['--allow-edits'],
    full: ['--yolo'],
  },
}
```

### 任务历史

任务列表会写到 `<root>/.ai-ins/runs/<run-id>.json`（和 `.log` 日志放在一起，建议把 `.ai-ins` 加进 `.gitignore`），所以刷新页面、重启 dev server 之后历史都还在，能续跑的任务照样可以接着聊。

- 列表按最近一轮的时间排序，分「今天 / 昨天 / 最近 7 天 / 更早」，支持按需求、组件名、文件路径搜索；不能继续的会话会标出来，鼠标悬停能看到原因。
- 右键会话可以置顶或删除；置顶的会话排在最上面，不会被自动清理，也不受「清空已结束」影响。
- dev server 在任务运行中重启，这一轮会被标记为「已中断」并保留已有输出；只要 Agent 的会话已经建立，就可以在这条任务里继续追问让它接着做。
- 每个项目默认保留最近 100 条（运行中和置顶的任务不会被清理）；删除会话（单条删除、「清空已结束」、超出上限的自动清理）会连同它在 `.ai-ins/` 下的 `.log` 日志一起删除。
- 列表接口只返回摘要，已结束任务的完整对话记录在点开时才加载。

```ts
aiIns({
  agents: {
    history: { limit: 50 }, // 或 false：只保存在内存里，重启 dev server 即清空
  },
})
```

### 改动与 diff

- 每轮回复卡片底部列出这一轮改动的文件和增减行数，点文件在面板里展开这一轮的 diff（只算这一轮做的改动，不是相对 HEAD），右侧图标在 IDE 打开。diff 随历史保存，单个文件最多 64KB、每轮最多 768KB。
- 侧边栏顶部可以在「会话 / 改动」之间切换。「改动」按 `git status` 分成「已暂存 / 未暂存」两组（可折叠），显示增减行数和最后改动它的会话；点文件在右侧看整页 diff，悬停可以暂存 / 取消暂存（`git add -A` / `git restore --staged`，只改暂存区，不碰工作区文件）。面板不提供提交和丢弃改动。

### 面板设置

主题、界面语言、权限、默认 Agent、网络代理、发送快捷键和完成通知保存在用户目录的 `~/.ai-ins/settings.json`（Windows 为 `%USERPROFILE%\.ai-ins\settings.json`），所有项目、端口和浏览器共用；文件权限为仅本人可读写，因为代理地址里可能带凭据。用户目录不可写时可以用 `AI_INS_HOME` 换一个目录；文件写不进去时面板退回浏览器里的副本，照常可用。第一次运行时会把浏览器里已有的设置迁移进去。

开启「完成通知」后，任务完成、失败或等待授权时，如果你没在看面板，会收到一条系统通知（需要浏览器授权，页面需为 HTTPS 或 localhost），点通知会打开对应的会话。

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
AI_INS_HOME=~/.ai-ins   # 面板设置 settings.json 所在目录
```

代理解析优先级：插件配置 / provider 配置优先，其次读取 `AI_INS_PROXY`，再读取常见的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`，最后尝试读取 macOS / Windows 系统代理。

跨平台命令解析会优先使用 `PATH` 中的可执行文件；Windows 下会优先选择 `.cmd` / `.bat` 等 npm 或原生命令 shim，因此只要 Codex、Claude、Copilot、Gemini 或 Cursor CLI 的安装目录已加入 `PATH`，macOS 和 Windows 都可以使用同一套配置。

## 本仓库开发

```bash
pnpm install
pnpm dev:watch
pnpm dev:nextjs
pnpm dev:webpack
pnpm dev:astro
```

`pnpm dev:watch` 会同时 watch core、Vite 插件和 `examples/vite-react` playground。改 `packages/core/src/client/` 或 `packages/vite/src/index.ts` 后刷新浏览器即可。`pnpm dev` 仍然会先构建 core / Vite 插件，再启动 playground。

`pnpm dev:vite` 会同时启动 `examples/vite-react`、`examples/vite-vue3`、`examples/vite-solidjs` 和 `examples/vite-svelte` 四个 Vite playground。

`pnpm dev:nextjs` 会先构建 core / Next.js 插件，再启动 `examples/nextjs-react` playground，默认使用 Turbopack。需要走 Webpack dev server 时可以运行 `pnpm dev:nextjs:webpack`。

`pnpm dev:webpack` 会先构建 core / Webpack 插件，再同时 watch core、Webpack 插件和 `examples/webpack-react` playground。改 `packages/core/src/client/` 后刷新浏览器即可看到新的 AI Ins 面板 runtime；如果改的是 Webpack 插件初始化逻辑，重启 dev server 后生效。

`pnpm dev:astro` 会先构建 core / Vite 插件 / Astro integration，再启动 `examples/astro` playground（`.astro` 页面 + React 岛屿）。

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
packages/astro     # Astro integration
examples/vite-react
examples/vite-vue3
examples/vite-solidjs
examples/vite-svelte
examples/nextjs-react
examples/astro
```

## 常见问题

### 如何连接 codex的？

Codex Exec 是一种轻量级、非交互式的 CLI 模式，专门用于自动化任务、CI/CD 管道和单次脚本执行。它通过命令行直接接收提示，处理任务，生成流式结构化日志并退出。
