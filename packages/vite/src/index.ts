import type { Plugin, ViteDevServer } from 'vite'
import { transformAsync, type PluginObj } from '@babel/core'
import { createDevInspectMiddlewares, ensureLaunchEditor, getDevInspectClientCode, normalizeProxy } from '@agent-dev/core'
import type { DevInspectPluginOptions } from '@agent-dev/core'

const clientModuleId = 'agent-dev/client'
const resolvedClientModuleId = `\0${clientModuleId}`
const sourceAttribute = 'data-agent-source'
const sourceRangeAttribute = 'data-agent-source-range'

function getSourceFileId(id: string) {
  const [fileName] = id.split('?', 1)
  return fileName
}

function shouldInjectSourceAttributes(id: string) {
  const fileName = getSourceFileId(id)
  return /\.[jt]sx$/u.test(fileName) && !fileName.includes('/node_modules/') && !fileName.includes('\\node_modules\\')
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
    name: 'agent-dev-source-attribute',
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

export type { DevInspectPluginOptions }

export function agentDev(options: DevInspectPluginOptions = {}): Plugin {
  let base = '/'
  let isServe = false
  let root = ''
  const pluginProxy = normalizeProxy(options.codex?.proxy ?? options.proxy)

  return {
    name: 'agent-dev:vite',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      base = config.base
      isServe = config.command === 'serve'
      root = config.root
      ensureLaunchEditor(config.command)
    },
    configureServer(server: ViteDevServer) {
      for (const route of createDevInspectMiddlewares(server.config.root, options)) {
        server.middlewares.use(route.path, route.middleware)
      }
    },
    load(id) {
      if (id !== resolvedClientModuleId || !isServe) return null
      return getDevInspectClientCode({ base, defaultProvider: options.agents?.defaultProvider, options, pluginProxy, root })
    },
    resolveId(source) {
      if (source === clientModuleId) return resolvedClientModuleId
      return null
    },
    async transform(code, id) {
      if (!isServe || !shouldInjectSourceAttributes(id)) return null
      const fileName = getSourceFileId(id)
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
    },
    transformIndexHtml() {
      if (!isServe) return
      return [{ attrs: { type: 'module' }, children: 'import "/@id/__x00__agent-dev/client";', tag: 'script' }]
    },
  }
}

export default agentDev
