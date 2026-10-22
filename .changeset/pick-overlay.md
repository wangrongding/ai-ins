---
"@ai-ins/core": patch
---

Option / Alt 点选的高亮改为独立浮层：带 `mask-image`、`clip-path`、`outline: none !important` 或处在 `overflow: hidden` 容器里的元素（如渐隐的地址栏输入框）也能看到完整边框，并且浮在页面的模态框和 popover 之上；面板打开时自动收起。
