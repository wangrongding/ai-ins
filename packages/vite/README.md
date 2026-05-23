# @ai-ins/vite

`@ai-ins/vite` 提供 AI Ins 的 Vite 插件，用于在开发态注入面板客户端，并为 JSX / Vue / Svelte 模板元素添加源码定位信息。

## 安装

```bash
pnpm add -D @ai-ins/vite
# or
npm install -D @ai-ins/vite
# or
yarn add -D @ai-ins/vite
```

## 最小示例

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

`aiIns()` 需要放在 React / Vue / Svelte 等框架插件前面，这样开发态源码标记才能在框架编译前注入。

## 它会做什么

- 在 dev server 中注册 `__ai-ins`、`__ai-ins-agent`、`__open-in-editor` 等接口。
- 自动向页面注入 AI Ins 客户端脚本。
- 为工作区内的 `.jsx` / `.tsx` / `.vue` / `.svelte` 文件注入源码定位属性。
- 在客户端面板中展示可用的本地 Agent provider。

## 常用配置

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import aiIns from '@ai-ins/vite'

export default defineConfig({
  plugins: [
    aiIns({
      root: process.cwd(),
      agents: {
        defaultProvider: 'codex',
      },
      codex: {
        model: 'gpt-5.5',
      },
    }),
    react(),
  ],
})
```

## 选项

`@ai-ins/vite` 复用 `@ai-ins/core` 的 `AiInsPluginOptions`：

| 选项 | 说明 |
| --- | --- |
| `root` | 指定 AI Ins 允许访问的项目根目录，默认使用 Vite `config.root`。 |
| `proxy` | 为所有 Agent provider 设置统一代理。 |
| `disableSourceAttributes` | 关闭源码定位属性注入，适合与 SSR / hydration 冲突的场景。 |
| `agents.defaultProvider` | 设置面板默认选中的 provider。 |
| `agents.providers` | 追加或覆盖内置 provider。 |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | 覆盖对应 CLI 的命令、模型与代理配置。 |

## 交互方式

启动 Vite dev server 后：

- `Option` / `Alt` + 点击页面元素：打开 AI Ins 面板并选中目标元素。
- macOS `Option + Cmd`，Windows / Linux `Ctrl + Alt` + 点击页面元素：直接在编辑器中打开源码位置。
- 关闭面板不会中断已经启动的 Agent 任务。

## 相关文档

- [仓库总览](../../README.md)
- [CLI 文档](../cli/README.md)
- [Core API 文档](../core/README.md)
