# ai-ins CLI

[Simplified Chinese](./README.md) | [English](./README.en.md)

`ai-ins` is the project setup CLI for AI Ins. It integrates AI Ins into Next.js, Vite, and Webpack projects.

It does two things:

- installs the matching `@ai-ins/*` package,
- tries to update the bundler config automatically.

See the repository docs at [README](../../README.md) and [README.en.md](../../README.en.md).

## Usage

```bash
npx ai-ins
npx ai-ins init
```

## Common scenarios

### Single-config project

```bash
npx ai-ins
```

### Specify the bundler

```bash
npx ai-ins --bundler vite
npx ai-ins --bundler webpack
npx ai-ins --bundler nextjs
```

### Specify the target config file

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

If multiple matching config files are found, the CLI stops and asks for `--config` instead of guessing.

## Command format

```bash
ai-ins [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force] [--cwd <path>]
ai-ins init [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force] [--cwd <path>]
```

## Options

| Option | Description |
| --- | --- |
| `--bundler <nextjs\|vite\|webpack>` | Skip auto-detection and choose the bundler explicitly. |
| `--config <path>` | Choose the config file to edit. Relative and absolute paths are both supported. |
| `--no-install` | Update config only, without installing packages. |
| `--force` | Reinstall the latest matching `@ai-ins/*` package even if it already exists. |
| `--cwd <path>` | Run the init flow in another directory. |
| `-h`, `--help` | Show help. |

## Detection rules

The CLI chooses the integration target based on:

1. the explicit `--bundler`,
2. the explicit `--config` filename,
3. project dependencies and config files.

If it detects multiple possible bundlers, it fails and asks you to choose manually.

## Manual fallback

If the CLI cannot rewrite the config safely, use the package docs directly:

- [Vite docs](../vite/README.en.md)
- [Webpack docs](../webpack/README.en.md)
- [Next.js docs](../nextjs/README.en.md)
