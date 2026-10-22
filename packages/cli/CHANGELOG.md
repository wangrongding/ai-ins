# ai-ins

## 1.0.7

## 1.0.6

### Patch Changes

- `npx ai-ins` 能正确接入更多写法的项目；Next.js 下设置相关接口不再 404；悬浮按钮贴边更利落。

  - CLI：`plugins` 写成变量（`defineConfig({ plugins })`）或表达式（`plugins: getPlugins()`）时，改成 `[aiIns(), ...原值]`，不再追加一个重复的 `plugins` 把原有插件覆盖掉。
  - CLI：在 monorepo 的子包里运行时，沿用根目录的包管理器（`packageManager` 字段或 lockfile），不再退回 npm。
  - CLI：空配置改写后正确换行，保留文件末尾换行；输出区分「新建 / 已配置 / 已修改」，重复运行时提示无需改动。
  - Next.js：转发规则改由实际注册的路由生成，修复 `/__ai-ins-config`、`/__ai-ins-settings` 返回 404。
  - 悬浮按钮：贴边后移开立即收回（磁吸范围从 140px 缩到 32px，不再卡顿）；贴边标签改为同心胶囊，呼吸条四边留白一致，呼吸时伸缩、光芯流过并带淡光晕。

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

## 1.0.0

### Major Changes

- 版本号与 `@ai-ins/*` 插件统一为 1.0.0，此后各包同步发版；CLI 本身没有行为变化。

## 0.4.0

### Minor Changes

- 5df7279: 新增 Astro 一等支持

  - 新增 `@ai-ins/astro` integration：仅在 `astro dev` 下挂载 AI Ins middleware 并通过页面脚本注入客户端，`astro build` 产物不受影响；`.astro` 模板在 Astro 编译前注入精确的 source 标记，React / Vue / Svelte 岛屿沿用 `@ai-ins/vite` 的注入；支持 Astro 4 ~ 7，不依赖 dev toolbar。
  - `ai-ins` CLI 识别 Astro 项目（优先于 vite），安装 `@ai-ins/astro` 并改写 `astro.config.*` 的 `integrations`；新增 `--bundler astro`。多行数组追加插件时保留 `]` 的原有换行，import 插入后不再多出空行。
  - core 客户端兼容 Astro 原生的 `data-astro-source-file` / `data-astro-source-loc` 作为定位回退，并加入幂等保护，避免同一页面被多个入口重复初始化。

## 0.3.3

### Patch Changes

- Add author and GitHub package metadata across published packages, and refresh the `ai-ins` CLI package README.

## 0.3.2

### Patch Changes

- Add a package-level README for the `ai-ins` CLI so npm users and AI agents can follow the correct integration flow, especially for multi-config projects.

## 0.3.1

### Patch Changes

- Improve `ai-ins init` for multi-config projects by adding `--config <path>`, better bundler/config detection, and clearer README guidance for humans and AI agents.

## 0.3.0

### Minor Changes

- Add Next.js support with Webpack and Turbopack source markers, dev middleware rewrites, client runtime injection, CLI init detection, and a Next.js playground.

## 0.2.2

### Patch Changes

- Add a `--force` init option to reinstall the latest matching AI Ins bundler package even when it is already present.

## 0.2.1

### Patch Changes

- Allow `npx ai-ins` to run the init flow by default while keeping `npx ai-ins init` and init options supported.

## 0.2.0

### Minor Changes

- 完成点选 dom 的跳转源码以及与 agent 交互的相关逻辑
