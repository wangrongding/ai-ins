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

function getClientRuntimeDirectory() {
  const sourcePath = join(__dirname, '..', 'src', 'client')
  return existsSync(sourcePath) ? sourcePath : join(__dirname, 'client')
}

export function getAiInsClientSource() {
  const clientRuntimeDirectory = getClientRuntimeDirectory()
  const style = clientStyleFiles.map((fileName) => readFileSync(join(clientRuntimeDirectory, fileName), 'utf-8')).join('\n')
  const scripts = clientRuntimeFiles.map((fileName) => readFileSync(join(clientRuntimeDirectory, fileName), 'utf-8'))

  return scripts.join('\n\n').replace('__WBX_CLIENT_STYLE__', JSON.stringify(style))
}

export function getAiInsClientWatchFiles() {
  const clientRuntimeDirectory = getClientRuntimeDirectory()
  return [...clientRuntimeFiles, ...clientStyleFiles].map((fileName) => join(clientRuntimeDirectory, fileName))
}
