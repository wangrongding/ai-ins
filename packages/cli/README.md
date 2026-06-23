# ai-ins CLI

[简体中文](./README.md) | [English](./README.en.md)

`ai-ins` 是 AI Ins 的项目接入 CLI，用来把 AI Ins 接到 Next.js、Vite 和 Webpack 项目里。

它会做两件事：

- 安装对应的 `@ai-ins/*` 包。
- 尝试改写 bundler 配置，把 AI Ins 接进去。

完整项目文档见仓库根目录 [README](../../README.md) / [README.en.md](../../README.en.md)。

## 安装与使用

无需全局安装，直接运行：

```bash
npx ai-ins
```

也可以显式写成：

```bash
npx ai-ins init
```

## 典型场景

### 单配置项目

```bash
npx ai-ins
```

### 指定 bundler

```bash
npx ai-ins --bundler vite
npx ai-ins --bundler webpack
npx ai-ins --bundler nextjs
```

### 指定目标配置文件

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

如果项目里存在多个候选配置文件，CLI 会直接停止，并要求你显式传 `--config`，不会静默修改第一个匹配文件。

## 命令格式

```bash
ai-ins [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force] [--cwd <path>]
ai-ins init [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force] [--cwd <path>]
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--bundler <nextjs\|vite\|webpack>` | 显式指定 bundler，跳过自动检测。 |
| `--config <path>` | 指定要修改的 bundler 配置文件，支持相对路径和绝对路径。 |
| `--no-install` | 只改配置，不安装依赖。 |
| `--force` | 即使已安装对应依赖，也重新安装最新的 `@ai-ins/*` 包。 |
| `--cwd <path>` | 在其他目录中执行初始化逻辑。 |
| `-h`, `--help` | 查看帮助。 |

## 自动检测规则

CLI 会优先按以下信息判断项目应接入哪个适配包：

1. 你显式传入的 `--bundler`。
2. 你显式传入的 `--config` 文件名。
3. 项目依赖与配置文件（Next.js / Vite / Webpack）。

如果同时检测到多个可能的 bundler，CLI 会直接报错并要求你手动指定，而不是猜测。

## 多配置文件项目

以下场景建议一开始就带上 `--config`：

- 一个仓库里有多个 Vite app。
- Electron / SSR 项目同时存在多个 `vite.*.config.*`。
- Webpack 项目同时存在 `webpack.config.js`、`webpack.dev.js`、`webpack.prod.js`。
- 你知道 dev server 实际读取的是某个特定配置，而不是默认文件名。

## CLI 无法安全改写时怎么办

如果 CLI 无法安全修改配置，会提示你手动接入。可以参考以下文档：

- [Vite 插件文档（中文）](../vite/README.md) / [English](../vite/README.en.md)
- [Webpack 插件文档（中文）](../webpack/README.md) / [English](../webpack/README.en.md)
- [Next.js 插件文档（中文）](../nextjs/README.md) / [English](../nextjs/README.en.md)
