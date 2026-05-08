import type { Plugin, ViteDevServer } from 'vite'
import { transformAsync, type PluginObj } from '@babel/core'
import { parse as parseSvelte } from 'svelte/compiler'
import { ElementTypes, NodeTypes, parse as parseVueTemplate } from '@vue/compiler-dom'
import { parse as parseVueSfc } from '@vue/compiler-sfc'
import { createAiInsMiddlewares, ensureLaunchEditor, getAiInsClientCode, normalizeProxy } from '@ai-ins/core'
import type { AiInsPluginOptions } from '@ai-ins/core'

const clientModuleId = 'ai-ins/client'
const resolvedClientModuleId = `\0${clientModuleId}`
const encodedClientModulePath = `/@id/__x00__${clientModuleId}`
const sourceAttribute = 'data-ai-ins-source'
const sourceRangeAttribute = 'data-ai-ins-source-range'

type VueSourceLocation = {
  offset: number
}

type VueNode = {
  type: number
  branches?: Array<{
    children?: VueNode[]
  }>
  children?: VueNode[]
  loc?: {
    end: VueSourceLocation
    start: VueSourceLocation
  }
  props?: Array<{
    name?: string
    type: number
  }>
  tag?: string
  tagType?: number
}

type SvelteNode = {
  attributes?: Array<{
    name?: string
    type?: string
  }>
  children?: SvelteNode[]
  end?: number
  fallback?: SvelteNode[]
  name?: string
  start?: number
  type?: string
}

function getSourceFileId(id: string) {
  const [fileName] = id.split('?', 1)
  return fileName
}

function withBase(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path

  return `${normalizedBase}${normalizedPath}`
}

function getBasePath(base: string) {
  if (!base || base === './' || base === '.') {
    return '/'
  }

  try {
    if (/^[a-z][a-z\d+\-.]*:\/\//iu.test(base)) {
      return new URL(base).pathname || '/'
    }
  } catch {
    return '/'
  }

  return base.startsWith('/') ? base : `/${base}`
}

function getMiddlewarePaths(base: string, path: string) {
  const basePath = getBasePath(base)
  return [...new Set([path, withBase(basePath, path)])]
}

function isWorkspaceSourceFile(fileName: string) {
  return !fileName.includes('/node_modules/') && !fileName.includes('\\node_modules\\')
}

function shouldInjectJsxSourceAttributes(id: string) {
  const fileName = getSourceFileId(id)
  return /\.[jt]sx$/u.test(fileName) && isWorkspaceSourceFile(fileName)
}

function shouldInjectVueSourceAttributes(id: string) {
  const fileName = getSourceFileId(id)
  return /\.vue$/u.test(fileName) && id === fileName && isWorkspaceSourceFile(fileName)
}

function shouldInjectSvelteSourceAttributes(id: string) {
  const fileName = getSourceFileId(id)
  return /\.svelte$/u.test(fileName) && id === fileName && isWorkspaceSourceFile(fileName)
}

function isNativeJsxElementName(name: unknown) {
  return Boolean(name && typeof name === 'object' && 'type' in name && name.type === 'JSXIdentifier' && 'name' in name && typeof name.name === 'string' && /^[a-z]/u.test(name.name))
}

function hasSourceAttribute(attributes: unknown[]) {
  return attributes.some((attribute) => {
    return Boolean(
      attribute &&
        typeof attribute === 'object' &&
        'type' in attribute &&
        attribute.type === 'JSXAttribute' &&
        'name' in attribute &&
        attribute.name &&
        typeof attribute.name === 'object' &&
        'type' in attribute.name &&
        attribute.name.type === 'JSXIdentifier' &&
        'name' in attribute.name &&
        (attribute.name.name === sourceAttribute || attribute.name.name === sourceRangeAttribute),
    )
  })
}

function createAgentSourcePlugin(fileName: string): PluginObj {
  return {
    name: 'ai-ins-source-attribute',
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path
        if (!isNativeJsxElementName(node.name) || hasSourceAttribute(node.attributes) || !node.loc) {
          return
        }

        const elementLocation = path.parentPath.isJSXElement() && path.parentPath.node.loc ? path.parentPath.node.loc : node.loc
        node.attributes.push(
          {
            name: { name: sourceAttribute, type: 'JSXIdentifier' },
            type: 'JSXAttribute',
            value: {
              type: 'StringLiteral',
              value: `${fileName}:${node.loc.start.line}:${node.loc.start.column + 1}`,
            },
          },
          {
            name: { name: sourceRangeAttribute, type: 'JSXIdentifier' },
            type: 'JSXAttribute',
            value: {
              type: 'StringLiteral',
              value: `${fileName}:${elementLocation.start.line}:${elementLocation.start.column + 1}-${elementLocation.end.line}:${elementLocation.end.column + 1}`,
            },
          },
        )
      },
    },
  }
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function getLineStartOffsets(source: string) {
  const offsets = [0]

  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      offsets.push(index + 1)
    }
  }

  return offsets
}

function getLocationFromOffset(offsets: number[], offset: number) {
  let low = 0
  let high = offsets.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const lineOffset = offsets[middle]
    const nextLineOffset = offsets[middle + 1] ?? Number.POSITIVE_INFINITY

    if (offset < lineOffset) {
      high = middle - 1
      continue
    }

    if (offset >= nextLineOffset) {
      low = middle + 1
      continue
    }

    return {
      column: offset - lineOffset + 1,
      line: middle + 1,
    }
  }

  const lastLine = offsets[offsets.length - 1] ?? 0
  return {
    column: offset - lastLine + 1,
    line: offsets.length,
  }
}

function hasVueSourceAttribute(props: Array<{ name?: string; type: number }>) {
  return props.some((prop) => prop.type === NodeTypes.ATTRIBUTE && (prop.name === sourceAttribute || prop.name === sourceRangeAttribute))
}

function hasSvelteSourceAttribute(attributes: Array<{ name?: string; type?: string }>) {
  return attributes.some((attribute) => attribute.type === 'Attribute' && (attribute.name === sourceAttribute || attribute.name === sourceRangeAttribute))
}

function getTemplateContentStartOffset(source: string, block: { content: string; loc: { end: VueSourceLocation; start: VueSourceLocation } }) {
  const blockSource = source.slice(block.loc.start.offset, block.loc.end.offset)
  const contentOffset = blockSource.indexOf(block.content)

  if (contentOffset >= 0) {
    return block.loc.start.offset + contentOffset
  }

  return source.indexOf(block.content, block.loc.start.offset)
}

function collectVueSourceInsertions(nodes: VueNode[], fileName: string, templateOffset: number, lineOffsets: number[], insertions: Array<{ content: string; offset: number }>) {
  for (const node of nodes) {
    if (node.type === NodeTypes.ELEMENT) {
      if (node.tagType === ElementTypes.ELEMENT && node.tag && node.loc && !hasVueSourceAttribute(node.props ?? [])) {
        const startOffset = templateOffset + node.loc.start.offset
        const endOffset = templateOffset + node.loc.end.offset
        const start = getLocationFromOffset(lineOffsets, startOffset)
        const end = getLocationFromOffset(lineOffsets, endOffset)
        const insertionOffset = startOffset + node.tag.length + 1
        const sourceValue = escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}`)
        const rangeValue = escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}-${end.line}:${end.column}`)

        insertions.push({
          content: ` ${sourceAttribute}="${sourceValue}" ${sourceRangeAttribute}="${rangeValue}"`,
          offset: insertionOffset,
        })
      }

      if (node.children?.length) {
        collectVueSourceInsertions(node.children, fileName, templateOffset, lineOffsets, insertions)
      }
      continue
    }

    if (node.branches?.length) {
      for (const branch of node.branches) {
        if (branch.children?.length) {
          collectVueSourceInsertions(branch.children, fileName, templateOffset, lineOffsets, insertions)
        }
      }
    }

    if (node.children?.length) {
      collectVueSourceInsertions(node.children, fileName, templateOffset, lineOffsets, insertions)
    }
  }
}

function collectSvelteSourceInsertions(node: SvelteNode, fileName: string, lineOffsets: number[], insertions: Array<{ content: string; offset: number }>, visited = new Set<SvelteNode>()) {
  if (!node || visited.has(node)) {
    return
  }

  visited.add(node)

  if (node.type === 'Element' && node.name && Number.isInteger(node.start) && Number.isInteger(node.end) && !hasSvelteSourceAttribute(node.attributes ?? [])) {
    const startOffset = node.start!
    const endOffset = node.end!
    const start = getLocationFromOffset(lineOffsets, startOffset)
    const end = getLocationFromOffset(lineOffsets, endOffset)
    const insertionOffset = startOffset + node.name.length + 1
    const sourceValue = escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}`)
    const rangeValue = escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}-${end.line}:${end.column}`)

    insertions.push({
      content: ` ${sourceAttribute}="${sourceValue}" ${sourceRangeAttribute}="${rangeValue}"`,
      offset: insertionOffset,
    })
  }

  for (const value of Object.values(node) as unknown[]) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          collectSvelteSourceInsertions(child as SvelteNode, fileName, lineOffsets, insertions, visited)
        }
      }
      continue
    }

    if (value && typeof value === 'object' && 'type' in value) {
      collectSvelteSourceInsertions(value as SvelteNode, fileName, lineOffsets, insertions, visited)
    }
  }
}

async function injectJsxSourceAttributes(code: string, fileName: string) {
  const result = await transformAsync(code, {
    babelrc: false,
    code: true,
    configFile: false,
    filename: fileName,
    parserOpts: {
      plugins: ['jsx', 'typescript'],
      sourceType: 'module',
    },
    plugins: [createAgentSourcePlugin(fileName)],
    sourceMaps: true,
  })

  return result?.code ? { code: result.code, map: result.map } : null
}

function injectVueTemplateSourceAttributes(code: string, fileName: string) {
  const { descriptor, errors } = parseVueSfc(code, { filename: fileName })

  if (errors.length || !descriptor.template) {
    return null
  }

  const templateOffset = getTemplateContentStartOffset(code, descriptor.template)
  if (templateOffset < 0) {
    return null
  }

  const templateAst = parseVueTemplate(descriptor.template.content)
  const lineOffsets = getLineStartOffsets(code)
  const insertions: Array<{ content: string; offset: number }> = []

  collectVueSourceInsertions(templateAst.children as VueNode[], fileName, templateOffset, lineOffsets, insertions)

  if (!insertions.length) {
    return null
  }

  let transformedCode = code
  for (const insertion of insertions.sort((left, right) => right.offset - left.offset)) {
    transformedCode = `${transformedCode.slice(0, insertion.offset)}${insertion.content}${transformedCode.slice(insertion.offset)}`
  }

  return {
    code: transformedCode,
    map: null,
  }
}

function injectSvelteSourceAttributes(code: string, fileName: string) {
  let ast: { html?: SvelteNode }

  try {
    ast = parseSvelte(code, { filename: fileName }) as { html?: SvelteNode }
  } catch {
    return null
  }

  if (!ast.html) {
    return null
  }

  const lineOffsets = getLineStartOffsets(code)
  const insertions: Array<{ content: string; offset: number }> = []

  collectSvelteSourceInsertions(ast.html, fileName, lineOffsets, insertions)

  if (!insertions.length) {
    return null
  }

  let transformedCode = code
  for (const insertion of insertions.sort((left, right) => right.offset - left.offset)) {
    transformedCode = `${transformedCode.slice(0, insertion.offset)}${insertion.content}${transformedCode.slice(insertion.offset)}`
  }

  return {
    code: transformedCode,
    map: null,
  }
}

export type { AiInsPluginOptions }

export function aiIns(options: AiInsPluginOptions = {}): Plugin {
  let base = '/'
  let isServe = false
  let root = ''
  const pluginProxy = normalizeProxy(options.codex?.proxy ?? options.proxy)

  return {
    name: 'ai-ins:vite',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      base = config.base
      isServe = config.command === 'serve'
      root = config.root
      ensureLaunchEditor(config.command)
    },
    configureServer(server: ViteDevServer) {
      for (const route of createAiInsMiddlewares(server.config.root, options)) {
        for (const path of getMiddlewarePaths(base, route.path)) {
          server.middlewares.use(path, route.middleware)
        }
      }
    },
    load(id) {
      if (id !== resolvedClientModuleId || !isServe) return null
      return getAiInsClientCode({ base, defaultProvider: options.agents?.defaultProvider, options, pluginProxy, root })
    },
    resolveId(source) {
      if (source === clientModuleId) return resolvedClientModuleId
      return null
    },
    async transform(code, id) {
      const fileName = getSourceFileId(id)
      if (!isServe || options.disableSourceAttributes) return null
      if (shouldInjectJsxSourceAttributes(id)) {
        return injectJsxSourceAttributes(code, fileName)
      }
      if (shouldInjectVueSourceAttributes(id)) {
        return injectVueTemplateSourceAttributes(code, fileName)
      }
      if (shouldInjectSvelteSourceAttributes(id)) {
        return injectSvelteSourceAttributes(code, fileName)
      }
      return null
    },
    transformIndexHtml() {
      if (!isServe) return
      return [{ attrs: { type: 'module' }, children: `import "${withBase(base, encodedClientModulePath)}";`, tag: 'script' }]
    },
  }
}

export default aiIns
