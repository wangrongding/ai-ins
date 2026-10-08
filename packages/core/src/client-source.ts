import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const clientRuntimeFiles = [
  'state.js',
  'dom.js',
  'ai-ins-dom.js',
  'api.js',
  'run-model.js',
  'react-panel.generated.js',
  'run-events.js',
  'events.js',
]

const clientStyleFiles = ['style.css']

const clientLoadedFlag = '__aiInsClientLoaded'

function getClientRuntimeDirectory() {
  const sourcePath = join(__dirname, '..', 'src', 'client')
  return existsSync(sourcePath) ? sourcePath : join(__dirname, 'client')
}

export function getAiInsClientSource() {
  const clientRuntimeDirectory = getClientRuntimeDirectory()
  const style = clientStyleFiles.map((fileName) => readFileSync(join(clientRuntimeDirectory, fileName), 'utf-8')).join('\n')
  const scripts = clientRuntimeFiles.map((fileName) => readFileSync(join(clientRuntimeDirectory, fileName), 'utf-8'))

  // 幂等保护：同一页面里客户端模块被多个入口加载（如 transformIndexHtml 与 Astro 页面脚本）时只初始化一次。
  const source = `if (!globalThis.${clientLoadedFlag}) {\nglobalThis.${clientLoadedFlag} = true\n\n${scripts.join('\n\n')}\n}\n`
  return source.replace('__WBX_CLIENT_STYLE__', JSON.stringify(style))
}

export function getAiInsClientWatchFiles() {
  const clientRuntimeDirectory = getClientRuntimeDirectory()
  return [...clientRuntimeFiles, ...clientStyleFiles].map((fileName) => join(clientRuntimeDirectory, fileName))
}
