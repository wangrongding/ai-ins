import { spawnSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { afterAll, describe, expect, it } from 'vitest'

/*
 * Runs the built CLI (`pnpm test` builds first) against throwaway projects, so
 * what is tested is exactly what `npx ai-ins` executes.
 */

const cli = join(dirname(fileURLToPath(import.meta.url)), '../dist/index.js')
const scratch = mkdtempSync(join(tmpdir(), 'ai-ins-cli-'))
afterAll(() => rmSync(scratch, { force: true, recursive: true }))

let projectCount = 0
function project(files: Record<string, string>) {
  const root = join(scratch, `p${projectCount++}`)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return root
}

function run(root: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [cli, '--no-install', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_user_agent: '', ...env },
  })
  return { code: result.status, output: result.stdout + result.stderr }
}

const read = (root: string, name: string) => readFileSync(join(root, name), 'utf8')
const vitePackage = JSON.stringify({ devDependencies: { vite: '^6' } })

describe('vite', () => {
  it('puts aiIns() before the framework plugins and imports it', () => {
    const root = project({
      'package.json': vitePackage,
      'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`,
    })
    expect(run(root).code).toBe(0)
    const config = read(root, 'vite.config.ts')
    expect(config).toContain(`import aiIns from '@ai-ins/vite'`)
    expect(config).toMatch(/plugins: \[\s*aiIns\(\),\s*react\(\)/u)
  })

  it('spreads a plugins variable instead of adding a second plugins key', () => {
    const root = project({
      'package.json': vitePackage,
      'vite.config.ts': `import { defineConfig } from 'vite'\n\nconst plugins = [vue()]\n\nexport default defineConfig({ plugins })\n`,
    })
    run(root)
    const config = read(root, 'vite.config.ts')
    expect(config).toContain('defineConfig({ plugins: [aiIns(), ...plugins] })')
    expect(config.match(/plugins:/gu)).toHaveLength(1)
  })

  it('spreads a plugins expression', () => {
    const root = project({
      'package.json': vitePackage,
      'vite.config.ts': `export default {\n  plugins: getPlugins(process.env.MODE),\n  server: { port: 3000 },\n}\n`,
    })
    run(root)
    expect(read(root, 'vite.config.ts')).toContain('plugins: [aiIns(), ...getPlugins(process.env.MODE)],\n  server: { port: 3000 },')
  })

  it('adds a plugins array to a function-form config', () => {
    const root = project({
      'package.json': vitePackage,
      'vite.config.ts': `import { defineConfig } from 'vite'\n\nexport default defineConfig(({ mode }) => ({\n  base: mode === 'production' ? '/app/' : '/',\n}))\n`,
    })
    run(root)
    expect(read(root, 'vite.config.ts')).toContain(`defineConfig(({ mode }) => ({\n  plugins: [aiIns()],\n  base:`)
  })

  it('changes nothing when run again, and says so', () => {
    const root = project({ 'package.json': vitePackage, 'vite.config.ts': `export default { plugins: [] }\n` })
    run(root)
    const once = read(root, 'vite.config.ts')
    const again = run(root)
    expect(read(root, 'vite.config.ts')).toBe(once)
    expect(again.output).toContain('Already configured vite.config.ts')
    expect(again.output).toContain('nothing to change')
  })

  it('stops on several config files unless --config picks one', () => {
    const root = project({
      'package.json': vitePackage,
      'vite.config.ts': 'export default {}\n',
      'vite.renderer.config.ts': 'export default { plugins: [] }\n',
    })
    const ambiguous = run(root)
    expect(ambiguous.code).not.toBe(0)
    expect(ambiguous.output).toContain('vite.renderer.config.ts')

    expect(run(root, ['--config', 'vite.renderer.config.ts']).code).toBe(0)
    expect(read(root, 'vite.renderer.config.ts')).toContain('plugins: [aiIns()]')
    expect(read(root, 'vite.config.ts')).toBe('export default {}\n')
  })
})

describe('astro', () => {
  it('wins over vite and formats an empty config', () => {
    const root = project({
      'astro.config.mjs': `import { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n`,
      'package.json': JSON.stringify({ dependencies: { astro: '^5', vite: '^6' } }),
    })
    expect(run(root).output).toContain('AI Ins init (astro)')
    expect(read(root, 'astro.config.mjs')).toContain(`import aiIns from '@ai-ins/astro'\n\nexport default defineConfig({\n  integrations: [aiIns()],\n});\n`)
  })
})

describe('webpack', () => {
  it('adds the plugin to a CommonJS config', () => {
    const root = project({
      'package.json': JSON.stringify({ devDependencies: { webpack: '^5' } }),
      'webpack.config.js': `module.exports = {\n  mode: 'development',\n  plugins: [],\n}\n`,
    })
    run(root)
    const config = read(root, 'webpack.config.js')
    expect(config).toContain(`const { AiInsWebpackPlugin } = require('@ai-ins/webpack')`)
    expect(config).toContain('new AiInsWebpackPlugin()')
  })

  it('asks for --bundler when vite and webpack are both present', () => {
    const root = project({ 'package.json': JSON.stringify({ devDependencies: { vite: '^6', webpack: '^5' } }) })
    const result = run(root)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('--bundler')
  })
})

describe('next.js', () => {
  const nextPackage = JSON.stringify({ dependencies: { next: '^15' } })

  it('creates next.config.ts and instrumentation-client.ts when there are none', () => {
    const root = project({ 'package.json': nextPackage })
    const result = run(root)
    expect(result.output).toContain('Created next.config.ts')
    expect(read(root, 'next.config.ts')).toContain('withAiIns(')
    expect(read(root, 'instrumentation-client.ts')).toContain(`import '@ai-ins/nextjs/client'`)
  })

  it('wraps a CommonJS export and keeps the trailing newline', () => {
    const root = project({
      'next.config.js': `const nextConfig = {\n  reactStrictMode: true,\n}\n\nmodule.exports = nextConfig\n`,
      'package.json': nextPackage,
    })
    run(root)
    const config = read(root, 'next.config.js')
    expect(config).toContain(`const { withAiIns } = require('@ai-ins/nextjs')`)
    expect(config.endsWith('module.exports = withAiIns(nextConfig)\n')).toBe(true)
  })

  it('adds the client import to an existing instrumentation-client.ts', () => {
    const root = project({
      'instrumentation-client.ts': `import posthog from 'posthog-js'\n\nposthog.init('key')\n`,
      'next.config.mjs': 'export default {}\n',
      'package.json': nextPackage,
    })
    run(root)
    const client = read(root, 'instrumentation-client.ts')
    expect(client).toContain(`import '@ai-ins/nextjs/client'`)
    expect(client).toContain(`posthog.init('key')`)
  })
})

describe('package manager', () => {
  // Stand-ins for npm / pnpm / yarn / bun that only report how they were called.
  const bin = join(scratch, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const manager of ['npm', 'pnpm', 'yarn', 'bun']) {
    writeFileSync(join(bin, manager), `#!/bin/sh\necho "RAN ${manager} $*"\n`)
    chmodSync(join(bin, manager), 0o755)
  }
  const install = (root: string) => {
    const result = spawnSync(process.execPath, [cli], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_config_user_agent: 'npm/10', PATH: `${bin}:${process.env.PATH}` },
    })
    return /RAN (.+)/u.exec(result.stdout)?.[1]
  }
  const viteConfig = 'export default { plugins: [] }\n'

  it.skipIf(process.platform === 'win32')('follows the lockfile', () => {
    expect(install(project({ 'package.json': vitePackage, 'vite.config.ts': viteConfig, 'yarn.lock': '' }))).toBe('yarn add -D @ai-ins/vite')
    expect(install(project({ 'bun.lock': '', 'package.json': vitePackage, 'vite.config.ts': viteConfig }))).toBe('bun add -d @ai-ins/vite')
  })

  it.skipIf(process.platform === 'win32')('uses the workspace root manager from a monorepo package', () => {
    const root = project({
      'apps/web/package.json': vitePackage,
      'apps/web/vite.config.ts': viteConfig,
      'package.json': JSON.stringify({ private: true }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': `packages:\n  - 'apps/*'\n`,
    })
    expect(install(join(root, 'apps/web'))).toBe('pnpm add -D @ai-ins/vite')
  })

  it.skipIf(process.platform === 'win32')('falls back to the manager that ran it', () => {
    const root = project({ 'package.json': vitePackage, 'vite.config.ts': viteConfig })
    expect(existsSync(join(root, 'package-lock.json'))).toBe(false)
    expect(install(root)).toBe('npm install -D @ai-ins/vite')
  })
})
