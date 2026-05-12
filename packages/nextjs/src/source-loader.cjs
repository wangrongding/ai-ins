const { transformSync } = require('@babel/core')
const transformReactJsx = require('@babel/plugin-transform-react-jsx')
const transformTypeScript = require('@babel/plugin-transform-typescript')

const sourceAttribute = 'data-ai-ins-source'
const sourceRangeAttribute = 'data-ai-ins-source-range'

function isNativeJsxElementName(name) {
  return Boolean(name && name.type === 'JSXIdentifier' && typeof name.name === 'string' && /^[a-z]/u.test(name.name))
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

module.exports = function aiInsNextSourceLoader(code, inputMap) {
  const callback = this.async()
  const fileName = this.resourcePath

  if (!/\.[cm]?[jt]sx$/u.test(fileName) || fileName.includes('/node_modules/') || fileName.includes('\\node_modules\\')) {
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
