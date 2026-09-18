const { transformSync } = require('@babel/core')
const transformReactJsx = require('@babel/plugin-transform-react-jsx')
const transformTypeScript = require('@babel/plugin-transform-typescript')

const sourceAttribute = 'data-ai-ins-source'
const sourceRangeAttribute = 'data-ai-ins-source-range'

function isNativeJsxElementName(name) {
  return Boolean(name && name.type === 'JSXIdentifier' && typeof name.name === 'string' && /^[a-z]/u.test(name.name))
}

// React 内建里 Fragment 会对未知 props 告警，其余不渲染 DOM、注入无意义。
const untaggableComponentNames = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler', 'Provider', 'Consumer'])

// 组件调用点也注入定位属性：spread 透传型组件（Radix/shadcn 等 {...props} 直达 DOM，
// 含 portal 内容）会把属性带到最终 DOM 上，让拾取端能定位到应用侧 JSX 而非库内部。
// 不透传 props 的组件会静默丢弃该属性，无副作用。
function isTaggableComponentJsxElementName(name) {
  if (!name) {
    return false
  }

  if (name.type === 'JSXIdentifier') {
    return typeof name.name === 'string' && /^[A-Z]/u.test(name.name) && !untaggableComponentNames.has(name.name)
  }

  if (name.type === 'JSXMemberExpression' && name.property && name.property.type === 'JSXIdentifier') {
    return typeof name.property.name === 'string' && !untaggableComponentNames.has(name.property.name)
  }

  return false
}

function hasSourceAttribute(attributes) {
  return attributes.some((attribute) => {
    return Boolean(
      attribute &&
        attribute.type === 'JSXAttribute' &&
        attribute.name &&
        attribute.name.type === 'JSXIdentifier' &&
        (attribute.name.name === sourceAttribute || attribute.name.name === sourceRangeAttribute),
    )
  })
}

function createAgentSourcePlugin(fileName) {
  return {
    name: 'ai-ins-source-attribute',
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path
        if ((!isNativeJsxElementName(node.name) && !isTaggableComponentJsxElementName(node.name)) || hasSourceAttribute(node.attributes) || !node.loc) {
          return
        }

        const elementLocation = path.parentPath.isJSXElement() && path.parentPath.node.loc ? path.parentPath.node.loc : node.loc
        // unshift 而非 push：让后续 {...props} 里外层调用点透传下来的属性覆盖本地注入，
        // 最终 DOM 上留下的是最外层（应用侧）的源位置，而不是包装组件内部的。
        node.attributes.unshift(
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

module.exports = function aiInsSourceLoader(code, inputMap) {
  const callback = this.async()
  const fileName = this.resourcePath

  if (!/\.[cm]?[jt]sx$/u.test(fileName)) {
    callback(null, code, inputMap)
    return
  }

  try {
    const result = transformSync(code, {
      babelrc: false,
      code: true,
      configFile: false,
      filename: fileName,
      inputSourceMap: inputMap || undefined,
      parserOpts: {
        plugins: ['jsx', 'typescript'],
        sourceType: 'module',
      },
      plugins: [
        createAgentSourcePlugin(fileName),
        [transformTypeScript, { allowDeclareFields: true, allExtensions: true, isTSX: true }],
        [transformReactJsx, { runtime: 'automatic' }],
      ],
      sourceMaps: true,
    })

    callback(null, result && result.code ? result.code : code, result ? result.map : inputMap)
  } catch (error) {
    callback(error)
  }
}
