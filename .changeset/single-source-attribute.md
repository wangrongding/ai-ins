---
"@ai-ins/core": patch
"@ai-ins/vite": patch
"@ai-ins/webpack": patch
"@ai-ins/nextjs": patch
"@ai-ins/astro": patch
---

开发环境注入到 DOM 上的源码位置从两个属性合并为一个：`data-ai-ins-source="文件:行:列-行:列"`，不再额外输出 `data-ai-ins-source-range`。起点即点选定位，整段即元素范围，开发时页面 DOM 里这部分体积约减半。Astro 中拿不到结束位置的 void / 自闭合元素仍只写 `文件:行:列`。
