import { parse } from '@astrojs/compiler'
import type { HmrContext, Plugin } from 'vite'

const sourceAttribute = 'data-ai-ins-source'
const sourceRangeAttribute = 'data-ai-ins-source-range'

// 这些元素加属性会改变 Astro 的处理语义（如带属性的 <script> 会变成 is:inline），
// 或者本身不渲染可点选的内容，统一跳过。
const skippedElementNames = new Set(['base', 'head', 'html', 'link', 'meta', 'noscript', 'script', 'slot', 'style', 'title'])

type AstroPoint = {
  offset: number
}

type AstroNode = {
  attributes?: Array<{ name?: string }>
  children?: AstroNode[]
  name?: string
  position?: {
    end?: AstroPoint
    start?: AstroPoint
  }
  type: string
}

function getSourceFileId(id: string) {
  const [fileName] = id.split('?', 1)
  return fileName
}

function isWorkspaceSourceFile(fileName: string) {
  return !fileName.includes('/node_modules/') && !fileName.includes('\\node_modules\\')
}

export function shouldInjectAstroSourceAttributes(id: string) {
  const fileName = getSourceFileId(id)
  return /\.astro$/u.test(fileName) && id === fileName && isWorkspaceSourceFile(fileName)
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

// @astrojs/compiler 返回的 offset 是 UTF-8 字节偏移，行列需要按字符重新计算。
function createLocator(bytes: Buffer) {
  const lineOffsets = [0]
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 10) {
      lineOffsets.push(index + 1)
    }
  }

  return (offset: number) => {
    let low = 0
    let high = lineOffsets.length - 1

    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (lineOffsets[middle] <= offset) {
        low = middle
      } else {
        high = middle - 1
      }
    }

    return {
      column: bytes.subarray(lineOffsets[low], offset).toString('utf-8').length + 1,
      line: low + 1,
    }
  }
}

function hasSourceAttribute(node: AstroNode) {
  return Boolean(node.attributes?.some((attribute) => attribute.name === sourceAttribute || attribute.name === sourceRangeAttribute))
}

function collectAstroSourceInsertions(node: AstroNode, fileName: string, bytes: Buffer, locate: ReturnType<typeof createLocator>, insertions: Array<{ content: string; offset: number }>) {
  const isTaggableElement = (node.type === 'element' || node.type === 'custom-element') && node.name && !skippedElementNames.has(node.name.toLowerCase())
  const startOffset = node.position?.start?.offset

  if (isTaggableElement && node.name && Number.isInteger(startOffset) && !hasSourceAttribute(node)) {
    const tagStart = startOffset!
    const insertionOffset = tagStart + 1 + Buffer.byteLength(node.name)

    // 位置与源码对不上时（极端语法）宁可不注入，也不破坏模板。
    if (bytes.subarray(tagStart, insertionOffset).toString('utf-8') === `<${node.name}`) {
      const start = locate(tagStart)
      const sourceValue = escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}`)
      let content = ` ${sourceAttribute}="${sourceValue}"`

      // void / 自闭合元素的 end 不可靠，只在 end 恰好落在 '>' 之后时输出范围。
      const endOffset = node.position?.end?.offset
      if (Number.isInteger(endOffset) && endOffset! > insertionOffset && bytes[endOffset! - 1] === 62) {
        const end = locate(endOffset!)
        content += ` ${sourceRangeAttribute}="${escapeHtmlAttribute(`${fileName}:${start.line}:${start.column}-${end.line}:${end.column}`)}"`
      }

      insertions.push({ content, offset: insertionOffset })
    }
  }

  for (const child of node.children ?? []) {
    collectAstroSourceInsertions(child, fileName, bytes, locate, insertions)
  }
}

export async function injectAstroSourceAttributes(code: string, fileName: string) {
  let ast: AstroNode

  try {
    ;({ ast } = (await parse(code, { position: true })) as unknown as { ast: AstroNode })
  } catch {
    return null
  }

  const bytes = Buffer.from(code, 'utf-8')
  const insertions: Array<{ content: string; offset: number }> = []
  collectAstroSourceInsertions(ast, fileName, bytes, createLocator(bytes), insertions)

  if (!insertions.length) {
    return null
  }

  const chunks: Buffer[] = []
  let cursor = 0
  for (const insertion of insertions.sort((left, right) => left.offset - right.offset)) {
    chunks.push(bytes.subarray(cursor, insertion.offset), Buffer.from(insertion.content, 'utf-8'))
    cursor = insertion.offset
  }
  chunks.push(bytes.subarray(cursor))

  return Buffer.concat(chunks).toString('utf-8')
}

// Astro 自己的 astro:build 插件同为 enforce: 'pre' 且排在用户插件之前，
// 这里用 order: 'pre' 抢在它编译 .astro 之前注入定位属性。
export function astroSourcePlugin(): Plugin {
  return {
    name: 'ai-ins:astro-source',
    enforce: 'pre',
    apply: 'serve',
    handleHotUpdate: {
      order: 'pre',
      handler(ctx: HmrContext) {
        if (!shouldInjectAstroSourceAttributes(ctx.file)) {
          return
        }

        // Astro 用 ctx.read() 与上次编译的源码比对来判断「只改了样式」，
        // 让它读到同样注入过的源码，样式热更新才能继续生效。
        const read = ctx.read.bind(ctx)
        ctx.read = async () => {
          const code = await read()
          return (await injectAstroSourceAttributes(code, ctx.file)) ?? code
        }
      },
    },
    transform: {
      order: 'pre',
      async handler(code, id, options) {
        // 客户端环境里 .astro 只是一个占位模块，只需处理 SSR 渲染用的那份。
        if (!options?.ssr || !shouldInjectAstroSourceAttributes(id)) {
          return null
        }

        const transformedCode = await injectAstroSourceAttributes(code, getSourceFileId(id))
        return transformedCode ? { code: transformedCode, map: null } : null
      },
    },
  }
}
