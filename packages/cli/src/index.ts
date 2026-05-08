#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

type Bundler = 'vite' | 'webpack'

type InitOptions = {
  bundler?: Bundler
  cwd: string
  install: boolean
}

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
}

const aiInsPackages: Record<Bundler, string> = {
  vite: '@ai-ins/vite',
  webpack: '@ai-ins/webpack',
}

const viteConfigFiles = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs']
const webpackConfigFiles = ['webpack.config.ts', 'webpack.config.mts', 'webpack.config.js', 'webpack.config.mjs', 'webpack.config.cts', 'webpack.config.cjs']

function printHelp() {
  console.log(`ai-ins

Usage:
  ai-ins [--bundler vite|webpack] [--no-install]
  ai-ins init [--bundler vite|webpack] [--no-install]

Examples:
  npx ai-ins
  npx ai-ins --bundler vite
  npx ai-ins init
  npx ai-ins init --bundler vite
`)
}

function printInitHelp() {
  console.log(`ai-ins init

Usage:
  ai-ins [init] [--bundler vite|webpack] [--no-install]

Options:
  --bundler vite|webpack  Specify the bundler instead of auto-detecting it.
  --no-install           Update config only, without installing dependencies.
  --cwd <path>           Run init in a different project directory.
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

function detectBundler(root: string, packageJson: PackageJson, requested?: Bundler): Bundler {
  if (requested) {
    return requested
  }

  if (hasDependency(packageJson, 'vite') || findExistingFile(root, viteConfigFiles)) {
    return 'vite'
  }

  if (hasDependency(packageJson, 'webpack') || hasDependency(packageJson, 'webpack-dev-server') || findExistingFile(root, webpackConfigFiles)) {
    return 'webpack'
  }

  fail('could not detect Vite or Webpack. Run with --bundler vite or --bundler webpack.')
}

function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = { cwd: process.cwd(), install: true }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--no-install') {
      options.install = false
      continue
    }

    if (arg === '--cwd') {
      const value = args[index + 1]
      if (!value) fail('--cwd requires a path')
      options.cwd = value
      index += 1
      continue
    }

    if (arg === '--bundler') {
      const value = args[index + 1]
      if (value !== 'vite' && value !== 'webpack') fail('--bundler must be vite or webpack')
      options.bundler = value
      index += 1
      continue
    }

    if (arg === 'vite' || arg === 'webpack') {
      options.bundler = arg
      continue
    }

    fail(`unknown option: ${arg}`)
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

function installPackage(root: string, packageJson: PackageJson, packageName: string) {
  if (hasDependency(packageJson, packageName)) {
    console.log(`- ${packageName} is already installed`)
    return
  }

  const packageManager = getPackageManager(root, packageJson)
  const installCommand = getInstallCommand(root, packageManager, packageName)
  console.log(`- Installing ${packageName} with ${packageManager}`)

  const result = spawnSync(installCommand.command, installCommand.args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    fail(`failed to install ${packageName}`)
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

function patchViteConfig(root: string) {
  const configFile = findExistingFile(root, viteConfigFiles) ?? join(root, 'vite.config.ts')
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

function patchWebpackConfig(root: string) {
  const configFile = findExistingFile(root, webpackConfigFiles) ?? join(root, 'webpack.config.js')
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
  const bundler = detectBundler(options.cwd, packageJson, options.bundler)
  const packageName = aiInsPackages[bundler]

  console.log(`AI Ins init (${bundler})`)
  if (options.install) {
    installPackage(options.cwd, packageJson, packageName)
  }

  const configFile = bundler === 'vite' ? patchViteConfig(options.cwd) : patchWebpackConfig(options.cwd)
  console.log(`- Updated ${configFile}`)
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

  if (command.startsWith('-') || command === 'vite' || command === 'webpack') {
    runInit(args)
    return
  }

  fail(`unknown command: ${command}`)
}

main(process.argv.slice(2))
