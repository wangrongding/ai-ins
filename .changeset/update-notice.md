---
"@ai-ins/core": patch
---

面板提示新版本，并可一键升级。

- 有新版本时，面板顶部出现「vX 可用」，设置里显示升级命令（按项目实际的适配包和包管理器生成，monorepo 下带 `cd` / `-w`），可复制，也可「让 Agent 升级」：新开对话由 Agent 运行命令并对照更新日志检查配置；「自动编辑」权限这一轮自动提到「询问我」，不支持询问的 Agent 需确认「完全访问」。
- 可跳过某个版本；开发服务器终端也会提示一次。
- 版本检查在 dev server 里进行：结果缓存 6 小时（失败 30 分钟后重试）、4 秒超时、npm 与 npmmirror 并行，失败不影响使用；CI、本地 link/workspace 依赖、`updateCheck: false`、`AI_INS_UPDATE_CHECK=0` 或 `NO_UPDATE_NOTIFIER=1` 时不检查。
