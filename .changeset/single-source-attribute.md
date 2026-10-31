---
"@ai-ins/core": patch
"@ai-ins/vite": patch
"@ai-ins/webpack": patch
"@ai-ins/nextjs": patch
"@ai-ins/astro": patch
---

开发环境注入到 DOM 上的源码位置更短了：从 `data-ai-ins-source` + `data-ai-ins-source-range` 两个绝对路径属性，合并为一个相对项目根目录的属性，例如 `data-ai-ins-source="src/App.tsx:12:5-18:11"`，开发时页面 DOM 里这部分体积约降到原来的三分之一。

- 起点就是点选定位的位置，整段是元素范围；Astro 中拿不到结束位置的 void / 自闭合元素只写 `文件:行:列`。
- 根目录之外的文件（如 monorepo 里其他包的组件）写成 `../` 开头的相对路径；不在同一磁盘等无法相对表示时仍写绝对路径。客户端会还原为绝对路径，打开编辑器、发给 Agent 的位置都不受影响。
- 升级后重启一次 dev server 即可，无需改配置；如果自己写了脚本读取 `data-ai-ins-source-range`，请改为从 `data-ai-ins-source` 解析。
