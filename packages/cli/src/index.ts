#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import process from 'node:process'

type Bundler = 'nextjs' | 'vite' | 'webpack'

type InitOptions = {
  bundler?: Bundler
  config?: string
  cwd: string
  forceInstall: boolean
  install: boolean
}

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
}

const aiInsPackages: Record<Bundler, string> = {
  nextjs: '@ai-ins/nextjs',
  vite: '@ai-ins/vite',
  webpack: '@ai-ins/webpack',
}

const nextConfigFiles = ['next.config.ts', 'next.config.mts', 'next.config.js', 'next.config.mjs', 'next.config.cts', 'next.config.cjs']
const nextClientInstrumentationFiles = ['instrumentation-client.ts', 'instrumentation-client.js']
const viteConfigFiles = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs']
const webpackConfigFiles = ['webpack.config.ts', 'webpack.config.mts', 'webpack.config.js', 'webpack.config.mjs', 'webpack.config.cts', 'webpack.config.cjs']
const viteConfigPattern = /^vite(?:\.[^.]+)*\.config(?:\.[^.]+)*\.[cm]?[jt]s$/u
const webpackConfigPattern = /^webpack(?:\.[^.]+)*(?:\.config(?:\.[^.]+)*|\.(?:dev|prod|common|base))(?:\.[^.]+)*\.[cm]?[jt]s$/u

function printHelp() {
  console.log(`ai-ins

Usage:
  ai-ins [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force]
  ai-ins init [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force]

Examples:
  npx ai-ins
  npx ai-ins --bundler nextjs
  npx ai-ins --bundler vite
  npx ai-ins --bundler vite --config apps/web/vite.config.ts
  npx ai-ins --force
  npx ai-ins init
  npx ai-ins init --bundler vite
`)
}

function printInitHelp() {
  console.log(`ai-ins init

Usage:
  ai-ins [init] [--bundler nextjs|vite|webpack] [--config <path>] [--no-install] [--force]

Options:
  --bundler nextjs|vite|webpack  Specify the bundler instead of auto-detecting it.
  --config <path>                Update a specific bundler config file instead of auto-picking one.
  --no-install                  Update config only, without installing dependencies.
  --force                       Install the latest matching @ai-ins/* package even if it is already installed.
  --cwd <path>                  Run init in a different project directory.
`)
}

function fail(message: string): never {
  console.error(`ai-ins: ${message}`)
  process.exit(1)
}

function isHelpArg(arg: string | undefined) {
  return arg === '--help' || arg === '-h'
}

function readJsonFile<T>(fileName: string): T {
  try {
    return JSON.parse(readFileSync(fileName, 'utf-8')) as T
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    fail(`failed to read ${fileName}: ${detail}`)
  }
}

function hasDependency(packageJson: PackageJson, dependencyName: string) {
  return Boolean(packageJson.dependencies?.[dependencyName] || packageJson.devDependencies?.[dependencyName])
}

function findExistingFile(root: string, candidates: string[]) {
  return candidates.map((fileName) => join(root, fileName)).find((fileName) => existsSync(fileName))
}

function inferBundlerFromConfig(fileName: string): Bundler | undefined {
  const baseName = fileName.split(/[/\\]/u).at(-1) ?? fileName

  if (nextConfigFiles.includes(baseName)) {
    return 'nextjs'
  }

  if (viteConfigFiles.includes(baseName) || viteConfigPattern.test(baseName)) {
    return 'vite'
  }

  if (webpackConfigFiles.includes(baseName) || webpackConfigPattern.test(baseName)) {
    return 'webpack'
  }

  return undefined
}

function listMatchingFiles(root: string, pattern: RegExp) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(root, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function uniqueFiles(fileNames: string[]) {
  return [...new Set(fileNames)]
}

function getConfigCandidates(root: string, bundler: Bundler) {
  if (bundler === 'nextjs') {
    return nextConfigFiles.map((fileName) => join(root, fileName)).filter((fileName) => existsSync(fileName))
  }

  if (bundler === 'vite') {
    return uniqueFiles([
      ...viteConfigFiles.map((fileName) => join(root, fileName)).filter((fileName) => existsSync(fileName)),
      ...listMatchingFiles(root, viteConfigPattern),
    ])
  }

  return uniqueFiles([
    ...webpackConfigFiles.map((fileName) => join(root, fileName)).filter((fileName) => existsSync(fileName)),
    ...listMatchingFiles(root, webpackConfigPattern),
  ])
}

function getDefaultConfigFile(root: string, bundler: Bundler) {
  return join(root, bundler === 'nextjs' ? 'next.config.ts' : bundler === 'vite' ? 'vite.config.ts' : 'webpack.config.js')
}

function resolveRequestedPath(root: string, fileName: string) {
  return isAbsolute(fileName) ? fileName : join(root, fileName)
}

function formatDisplayPath(root: string, fileName: string) {
  const displayPath = relative(root, fileName)
  return displayPath || fileName
}

function getBundlerLabel(bundler: Bundler) {
  return bundler === 'nextjs' ? 'Next.js' : bundler === 'vite' ? 'Vite' : 'Webpack'
}

function resolveConfigFile(root: string, bundler: Bundler, requestedConfig?: string) {
  if (requestedConfig) {
    return resolveRequestedPath(root, requestedConfig)
  }

  const configFiles = getConfigCandidates(root, bundler)
  if (configFiles.length === 1) {
    return configFiles[0]
  }

  if (configFiles.length > 1) {
    const details = configFiles.map((fileName) => `  - ${formatDisplayPath(root, fileName)}`).join('\n')
    fail(`found multiple ${getBundlerLabel(bundler)} config files:\n${details}\nRun with --bundler ${bundler} --config <path> to choose one.`)
  }

  return getDefaultConfigFile(root, bundler)
}

function detectBundler(root: string, packageJson: PackageJson, requested?: Bundler, requestedConfig?: string): Bundler {
  if (requested) {
    return requested
  }

  const inferredBundler = requestedConfig ? inferBundlerFromConfig(requestedConfig) : undefined
  if (inferredBundler) {
    return inferredBundler
  }

  const detectedBundlers: Bundler[] = []

  if (hasDependency(packageJson, 'next') || getConfigCandidates(root, 'nextjs').length > 0) {
    detectedBundlers.push('nextjs')
  }

  if (hasDependency(packageJson, 'vite') || getConfigCandidates(root, 'vite').length > 0) {
    detectedBundlers.push('vite')
  }

  if (hasDependency(packageJson, 'webpack') || hasDependency(packageJson, 'webpack-dev-server') || getConfigCandidates(root, 'webpack').length > 0) {
    detectedBundlers.push('webpack')
  }

  if (detectedBundlers.length === 1) {
    return detectedBundlers[0]
  }

  if (detectedBundlers.length > 1) {
    fail(`found multiple possible bundlers (${detectedBundlers.join(', ')}). Run with --bundler nextjs, --bundler vite or --bundler webpack.`)
  }

  fail('could not detect Next.js, Vite or Webpack. Run with --bundler nextjs, --bundler vite or --bundler webpack.')
}

function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = { cwd: process.cwd(), forceInstall: false, install: true }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--no-install') {
      options.install = false
      continue
    }

    if (arg === '--force') {
      options.forceInstall = true
      continue
    }

    if (arg === '--cwd') {
      const value = args[index + 1]
      if (!value) fail('--cwd requires a path')
      options.cwd = value
      index += 1
      continue
    }

    if (arg === '--config') {
      const value = args[index + 1]
      if (!value) fail('--config requires a path')
      options.config = value
      index += 1
      continue
    }

    if (arg === '--bundler') {
      const value = args[index + 1]
      if (value !== 'nextjs' && value !== 'vite' && value !== 'webpack') fail('--bundler must be nextjs, vite or webpack')
      options.bundler = value
      index += 1
      continue
    }

    if (arg === 'nextjs' || arg === 'vite' || arg === 'webpack') {
      options.bundler = arg
      continue
    }

    fail(`unknown option: ${arg}`)
  }

  if (!options.install && options.forceInstall) {
    fail('--force cannot be used with --no-install')
  }

  return options
}

function getPackageManager(root: string, packageJson: PackageJson) {
  const declared = packageJson.packageManager?.split('@')[0]
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'npm' || declared === 'bun') {
    return declared
  }

  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun'
  const userAgent = process.env.npm_config_user_agent?.split(' ')[0]?.split('/')[0]
  if (userAgent === 'pnpm' || userAgent === 'yarn' || userAgent === 'npm' || userAgent === 'bun') {
    return userAgent
  }

  return 'npm'
}

function getInstallCommand(root: string, packageManager: string, packageName: string) {
  if (packageManager === 'pnpm') {
    const workspaceRootFlag = existsSync(join(root, 'pnpm-workspace.yaml')) ? ['-w'] : []
    return { args: ['add', '-D', packageName, ...workspaceRootFlag], command: 'pnpm' }
  }
  if (packageManager === 'yarn') return { args: ['add', '-D', packageName], command: 'yarn' }
  if (packageManager === 'bun') return { args: ['add', '-d', packageName], command: 'bun' }
  return { args: ['install', '-D', packageName], command: 'npm' }
}

function getLatestPackageSpec(packageName: string) {
  return `${packageName}@latest`
}

function installPackage(root: string, packageJson: PackageJson, packageName: string, forceInstall: boolean) {
  if (hasDependency(packageJson, packageName) && !forceInstall) {
    console.log(`- ${packageName} is already installed`)
    return
  }

  const packageManager = getPackageManager(root, packageJson)
  const packageSpec = forceInstall ? getLatestPackageSpec(packageName) : packageName
  const installCommand = getInstallCommand(root, packageManager, packageSpec)
  console.log(forceInstall ? `- Installing latest ${packageName} with ${packageManager}` : `- Installing ${packageName} with ${packageManager}`)

  const result = spawnSync(installCommand.command, installCommand.args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    fail(`failed to install ${packageSpec}`)
  }
}

function getLineIndent(code: string, index: number) {
  const lineStart = code.lastIndexOf('\n', index) + 1
  const match = code.slice(lineStart, index).match(/^\s*/u)
  return match?.[0] ?? ''
}

function findMatchingBracket(code: string, openIndex: number, openChar: string, closeChar: string) {
  let depth = 0
  let quote: '"' | "'" | '`' | undefined
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index]
    const nextChar = code[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }

    if (blockComment) {
      if (char === '*' && nextChar === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = undefined
      }
      continue
    }

    if (char === '/' && nextChar === '/') {
      lineComment = true
      index += 1
      continue
    }

    if (char === '/' && nextChar === '*') {
      blockComment = true
      index += 1
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === openChar) {
      depth += 1
    } else if (char === closeChar) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function insertImport(code: string, statement: string) {
  const importMatches = [...code.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gmu)]
  const lastImport = importMatches.at(-1)
  if (lastImport?.index !== undefined) {
    return `${code.slice(0, lastImport.index + lastImport[0].length)}\n${statement}${code.slice(lastImport.index + lastImport[0].length)}`
  }

  return `${statement}\n${code}`
}

function insertRequire(code: string, statement: string) {
  const requireMatches = [...code.matchAll(/^(?:const|let|var)\s+[\s\S]*?=\s*require\(['"][^'"]+['"]\);?\s*$/gmu)]
  const lastRequire = requireMatches.at(-1)
  if (lastRequire?.index !== undefined) {
    return `${code.slice(0, lastRequire.index + lastRequire[0].length)}\n${statement}${code.slice(lastRequire.index + lastRequire[0].length)}`
  }

  return `${statement}\n${code}`
}

function uniqueIdentifier(code: string, preferredName: string) {
  if (!new RegExp(`\\b${preferredName}\\b`, 'u').test(code)) {
    return preferredName
  }

  let index = 2
  while (new RegExp(`\\b${preferredName}${index}\\b`, 'u').test(code)) {
    index += 1
  }

  return `${preferredName}${index}`
}

function addPluginToArray(code: string, expression: string, position: 'start' | 'end' = 'end') {
  const match = /\bplugins\s*:\s*\[/u.exec(code)
  if (!match) {
    return null
  }

  const openIndex = match.index + match[0].lastIndexOf('[')
  const closeIndex = findMatchingBracket(code, openIndex, '[', ']')
  if (closeIndex === -1) {
    return null
  }

  const beforeClose = code.slice(0, closeIndex)
  const arrayBody = code.slice(openIndex + 1, closeIndex)
  if (!arrayBody.trim()) {
    return `${beforeClose}${expression}${code.slice(closeIndex)}`
  }

  if (position === 'start') {
    const afterOpen = code.slice(openIndex + 1)
    if (arrayBody.includes('\n')) {
      const indent = `${getLineIndent(code, openIndex)}  `
      return `${code.slice(0, openIndex + 1)}\n${indent}${expression},${afterOpen}`
    }

    return `${code.slice(0, openIndex + 1)}${expression}, ${afterOpen}`
  }

  if (arrayBody.includes('\n')) {
    const indent = getLineIndent(code, closeIndex)
    const trimmedBeforeClose = beforeClose.replace(/\s+$/u, '')
    const comma = trimmedBeforeClose.endsWith(',') ? '' : ','
    return `${trimmedBeforeClose}${comma}\n${indent}  ${expression}${code.slice(closeIndex)}`
  }

  const trimmedBeforeClose = beforeClose.replace(/\s+$/u, '')
  const separator = trimmedBeforeClose.endsWith(',') ? ' ' : ', '
  return `${trimmedBeforeClose}${separator}${expression}${code.slice(closeIndex)}`
}

function addPluginProperty(code: string, expression: string) {
  const objectPatterns = [/defineConfig\s*\(\s*\{/u, /export\s+default\s+\{/u, /module\.exports\s*=\s*\{/u]

  for (const pattern of objectPatterns) {
    const match = pattern.exec(code)
    if (!match) continue

    const openIndex = match.index + match[0].lastIndexOf('{')
    const indent = getLineIndent(code, openIndex)
    return `${code.slice(0, openIndex + 1)}\n${indent}  plugins: [${expression}],${code.slice(openIndex + 1)}`
  }

  return null
}

function patchPluginConfig(code: string, expression: string, position: 'start' | 'end' = 'end') {
  return addPluginToArray(code, expression, position) ?? addPluginProperty(code, expression)
}

function patchViteConfig(root: string, requestedConfig?: string) {
  const configFile = resolveConfigFile(root, 'vite', requestedConfig)
  if (!existsSync(configFile)) {
    writeFileSync(
      configFile,
      `import aiIns from '@ai-ins/vite'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [aiIns()],\n})\n`,
    )
    return configFile
  }

  const code = readFileSync(configFile, 'utf-8')
  if (code.includes('@ai-ins/vite')) {
    return configFile
  }

  const importName = uniqueIdentifier(code, 'aiIns')
  const withImport = insertImport(code, `import ${importName} from '@ai-ins/vite'`)
  const patched = patchPluginConfig(withImport, `${importName}()`, 'start')
  if (!patched) {
    fail(`could not update ${configFile}. Add ${importName}() to the Vite plugins array manually.`)
  }

  writeFileSync(configFile, patched)
  return configFile
}

function patchWebpackConfig(root: string, requestedConfig?: string) {
  const configFile = resolveConfigFile(root, 'webpack', requestedConfig)
  if (!existsSync(configFile)) {
    writeFileSync(
      configFile,
      `const { AiInsWebpackPlugin } = require('@ai-ins/webpack')\n\nmodule.exports = {\n  devServer: {},\n  plugins: [new AiInsWebpackPlugin()],\n}\n`,
    )
    return configFile
  }

  const code = readFileSync(configFile, 'utf-8')
  if (code.includes('@ai-ins/webpack')) {
    return configFile
  }

  const className = uniqueIdentifier(code, 'AiInsWebpackPlugin')
  const isCommonJs = configFile.endsWith('.cjs') || code.includes('module.exports') || code.includes('require(')
  const statement = isCommonJs
    ? className === 'AiInsWebpackPlugin'
      ? `const { AiInsWebpackPlugin } = require('@ai-ins/webpack')`
      : `const { AiInsWebpackPlugin: ${className} } = require('@ai-ins/webpack')`
    : className === 'AiInsWebpackPlugin'
      ? `import { AiInsWebpackPlugin } from '@ai-ins/webpack'`
      : `import { AiInsWebpackPlugin as ${className} } from '@ai-ins/webpack'`
  const withImport = isCommonJs ? insertRequire(code, statement) : insertImport(code, statement)
  const patched = patchPluginConfig(withImport, `new ${className}()`)
  if (!patched) {
    fail(`could not update ${configFile}. Add new ${className}() to the Webpack plugins array manually.`)
  }

  writeFileSync(configFile, patched)
  return configFile
}

function patchNextConfig(root: string, requestedConfig?: string) {
  const configFile = resolveConfigFile(root, 'nextjs', requestedConfig)
  if (!existsSync(configFile)) {
    writeFileSync(
      configFile,
      `import { withAiIns } from '@ai-ins/nextjs'\nimport type { NextConfig } from 'next'\n\nconst nextConfig: NextConfig = {}\n\nexport default withAiIns(nextConfig)\n`,
    )
    return configFile
  }

  const code = readFileSync(configFile, 'utf-8')
  if (code.includes('@ai-ins/nextjs')) {
    return configFile
  }

  const helperName = uniqueIdentifier(code, 'withAiIns')
  const isCommonJs = configFile.endsWith('.cjs') || code.includes('module.exports') || code.includes('require(')
  const statement = isCommonJs
    ? helperName === 'withAiIns'
      ? `const { withAiIns } = require('@ai-ins/nextjs')`
      : `const { withAiIns: ${helperName} } = require('@ai-ins/nextjs')`
    : helperName === 'withAiIns'
      ? `import { withAiIns } from '@ai-ins/nextjs'`
      : `import { withAiIns as ${helperName} } from '@ai-ins/nextjs'`
  const withImport = isCommonJs ? insertRequire(code, statement) : insertImport(code, statement)

  const commonJsObjectMatch = /module\.exports\s*=\s*\{/u.exec(withImport)
  if (commonJsObjectMatch?.index !== undefined) {
    const openIndex = commonJsObjectMatch.index + commonJsObjectMatch[0].lastIndexOf('{')
    const closeIndex = findMatchingBracket(withImport, openIndex, '{', '}')
    if (closeIndex !== -1) {
      const start = commonJsObjectMatch.index
      const end = closeIndex + (withImport[closeIndex + 1] === ';' ? 2 : 1)
      const expression = withImport.slice(openIndex, closeIndex + 1)
      writeFileSync(configFile, `${withImport.slice(0, start)}module.exports = ${helperName}(${expression})${withImport.slice(end)}`)
      return configFile
    }
  }

  const commonJsMatch = /module\.exports\s*=\s*([^\n]+?);?\s*$/mu.exec(withImport)
  if (commonJsMatch?.index !== undefined) {
    const expression = commonJsMatch[1].trim()
    const start = commonJsMatch.index
    const end = commonJsMatch.index + commonJsMatch[0].length
    const replacement = `module.exports = ${helperName}(${expression})`
    writeFileSync(configFile, `${withImport.slice(0, start)}${replacement}${withImport.slice(end)}`)
    return configFile
  }

  const exportObjectMatch = /export\s+default\s+\{/u.exec(withImport)
  if (exportObjectMatch?.index !== undefined) {
    const openIndex = exportObjectMatch.index + exportObjectMatch[0].lastIndexOf('{')
    const closeIndex = findMatchingBracket(withImport, openIndex, '{', '}')
    if (closeIndex !== -1) {
      const start = exportObjectMatch.index
      const end = closeIndex + (withImport[closeIndex + 1] === ';' ? 2 : 1)
      const expression = withImport.slice(openIndex, closeIndex + 1)
      writeFileSync(configFile, `${withImport.slice(0, start)}export default ${helperName}(${expression})${withImport.slice(end)}`)
      return configFile
    }
  }

  const exportMatch = /export\s+default\s+([^\n]+?);?\s*$/mu.exec(withImport)
  if (exportMatch?.index !== undefined) {
    const expression = exportMatch[1].trim()
    const start = exportMatch.index
    const end = exportMatch.index + exportMatch[0].length
    const replacement = `export default ${helperName}(${expression})`
    writeFileSync(configFile, `${withImport.slice(0, start)}${replacement}${withImport.slice(end)}`)
    return configFile
  }

  fail(`could not update ${configFile}. Wrap your Next.js config with ${helperName}(nextConfig) manually.`)
}

function patchNextClientInstrumentation(root: string) {
  const configFile = findExistingFile(root, nextClientInstrumentationFiles) ?? join(root, 'instrumentation-client.ts')
  if (!existsSync(configFile)) {
    writeFileSync(configFile, `import '@ai-ins/nextjs/client'\n`)
    return configFile
  }

  const code = readFileSync(configFile, 'utf-8')
  if (code.includes('@ai-ins/nextjs/client')) {
    return configFile
  }

  writeFileSync(configFile, insertImport(code, `import '@ai-ins/nextjs/client'`))
  return configFile
}

function runInit(args: string[]) {
  if (isHelpArg(args[0])) {
    printInitHelp()
    return
  }

  const options = parseInitOptions(args)
  const packageJsonPath = join(options.cwd, 'package.json')
  if (!existsSync(packageJsonPath)) {
    fail('package.json not found in the current project')
  }

  const packageJson = readJsonFile<PackageJson>(packageJsonPath)
  const bundler = detectBundler(options.cwd, packageJson, options.bundler, options.config)
  const packageName = aiInsPackages[bundler]

  console.log(`AI Ins init (${bundler})`)
  if (options.install) {
    installPackage(options.cwd, packageJson, packageName, options.forceInstall)
  }

  const configFile = bundler === 'nextjs' ? patchNextConfig(options.cwd, options.config) : bundler === 'vite' ? patchViteConfig(options.cwd, options.config) : patchWebpackConfig(options.cwd, options.config)
  const clientFile = bundler === 'nextjs' ? patchNextClientInstrumentation(options.cwd) : undefined
  console.log(`- Updated ${configFile}`)
  if (clientFile) {
    console.log(`- Updated ${clientFile}`)
  }
  console.log('Done. Restart your dev server to load AI Ins.')
}

function main(args: string[]) {
  const command = args[0]
  if (isHelpArg(command)) {
    printHelp()
    return
  }

  if (!command) {
    runInit([])
    return
  }

  if (command === 'init') {
    runInit(args.slice(1))
    return
  }

  if (command.startsWith('-') || command === 'nextjs' || command === 'vite' || command === 'webpack') {
    runInit(args)
    return
  }

  fail(`unknown command: ${command}`)
}

main(process.argv.slice(2))
