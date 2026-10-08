---
"@ai-ins/astro": minor
"ai-ins": minor
"@ai-ins/core": patch
---

新增 Astro 一等支持

- 新增 `@ai-ins/astro` integration：仅在 `astro dev` 下挂载 AI Ins middleware 并通过页面脚本注入客户端，`astro build` 产物不受影响；`.astro` 模板在 Astro 编译前注入精确的 source 标记，React / Vue / Svelte 岛屿沿用 `@ai-ins/vite` 的注入；支持 Astro 4 ~ 7，不依赖 dev toolbar。
- `ai-ins` CLI 识别 Astro 项目（优先于 vite），安装 `@ai-ins/astro` 并改写 `astro.config.*` 的 `integrations`；新增 `--bundler astro`。多行数组追加插件时保留 `]` 的原有换行，import 插入后不再多出空行。
- core 客户端兼容 Astro 原生的 `data-astro-source-file` / `data-astro-source-loc` 作为定位回退，并加入幂等保护，避免同一页面被多个入口重复初始化。
