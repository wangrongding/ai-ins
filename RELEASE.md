# 发布流程：Changesets

本文档记录 AI Ins monorepo 的标准发布流程。根包 `ai-ins-workspace` 是 private，不会发布；实际发布的是 `packages/*` 下的 npm 包。

## 发布包

- `ai-ins`：CLI 包，提供 `ai-ins` 命令。
- `@ai-ins/core`：共享运行时。
- `@ai-ins/vite`：Vite 插件。
- `@ai-ins/webpack`：Webpack 插件。

## 发布前检查

确认已经登录 npm：

```bash
npm whoami
```

确认安装依赖：

```bash
pnpm install
```

确认 changesets 默认公开发布：

```json
{
  "access": "public"
}
```

对应文件是 `.changeset/config.json`。

## 常规发布步骤

1. 生成 changeset

```bash
pnpm changeset
```

根据本次变更选择要发布的包和版本类型：

- `patch`：修复 bug 或小改动。
- `minor`：新增向后兼容功能。
- `major`：破坏性变更。

执行后会在 `.changeset/` 下生成一份发布说明文件。

2. 更新版本和 changelog

```bash
pnpm version-packages
```

该命令会：

- 更新相关包的 `version`。
- 更新内部 workspace 依赖版本。
- 更新各包的 `CHANGELOG.md`。
- 删除已经消费掉的 changeset 文件。

3. 本地验证

```bash
pnpm typecheck
pnpm build
```

如果要检查 npm tarball 内容，可以先 dry-run：

```bash
pnpm -r --filter './packages/*' publish --dry-run
```

4. 发布到 npm

```bash
pnpm release
```

该命令等价于：

```bash
pnpm build && changeset publish
```

发布成功后，changesets 会为成功发布的包创建对应 git tag。

5. 推送代码和 tag

```bash
git status
git push
git push --tags
```

## 发布后验证

检查 npm 上的版本：

```bash
npm view ai-ins version
npm view @ai-ins/core version
npm view @ai-ins/vite version
npm view @ai-ins/webpack version
```

检查 CLI 是否可用：

```bash
npx ai-ins --help
npx ai-ins init --help
```

## 补发失败的包

如果部分包已经发布成功，某个包失败，不要手动改版本。修复失败原因后重新执行：

```bash
pnpm exec changeset publish
```

changesets 会检查 npm registry，跳过已经发布过的版本，只继续发布还没有发布成功的包。

如果只想手动补发 CLI 包：

```bash
pnpm --filter ai-ins build
cd packages/cli
npm publish
```

手动发布不会自动创建 changesets tag。发布成功后需要自己补 tag：

```bash
git tag ai-ins@<version>
git push origin ai-ins@<version>
```

## 常见问题

### Scoped 包发布失败

`@ai-ins/core`、`@ai-ins/vite`、`@ai-ins/webpack` 是 scoped packages，需要公开发布权限。

确保每个 scoped 包的 `package.json` 里有：

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

并确认 `.changeset/config.json` 中：

```json
{
  "access": "public"
}
```

### npm 要求浏览器认证

如果发布时出现：

```text
Authenticate your account at:
https://www.npmjs.com/auth/cli/...
```

按提示打开链接完成认证，然后回到终端继续。

### 包名相似导致 403

如果 npm 返回：

```text
Package name too similar to existing package ...
```

这是 npm 的包名风控。需要更换包名、改为 scoped 包，或向 npm support 申请人工复核。

