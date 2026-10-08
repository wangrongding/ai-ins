# @ai-ins/astro

AI Ins 的 Astro integration。

```bash
npx ai-ins
# 或
npx astro add @ai-ins/astro
```

手动接入：

```ts
import { defineConfig } from 'astro/config'
import aiIns from '@ai-ins/astro'

export default defineConfig({
  integrations: [aiIns()],
})
```

- 只在 `astro dev` 下生效，`astro build` / `astro preview` 产物不包含任何 AI Ins 代码。
- `Option` / `Alt` 点选页面元素即可打开 AI Ins 面板；`.astro` 模板与 React / Vue / Svelte 岛屿都能定位到源码。
- 参数与 `@ai-ins/vite` 相同，详见仓库根目录 README。
