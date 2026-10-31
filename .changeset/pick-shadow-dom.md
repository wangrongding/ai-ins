---
"@ai-ins/core": patch
---

Option / Alt 点选能进入页面的 open Shadow DOM：渲染在 shadow root 里的元素（例如为了避开浏览器扩展而把消息列表放进 shadow 的页面）也能悬停、点选，Option + ↑ 能一路穿过 shadow 边界走到外层组件，发给 Agent 的组件层级也不再在边界处中断。closed 模式的 shadow 无法从外部访问，仍只能选到它的宿主元素。
