import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const clientRuntimeFiles = [
  'state.js',
  'dom.js',
  'ai-ins-dom.js',
  'api.js',
  'run-model.js',
  'components.js',
  'run-events.js',
  'panel.js',
  'events.js',
]

function getClientRuntimeDirectory() {
  const sourcePath = join(__dirname, '..', 'src', 'client')
  return existsSync(sourcePath) ? sourcePath : join(__dirname, 'client')
}

export function getAiInsClientSource() {
  const clientRuntimeDirectory = getClientRuntimeDirectory()
  const style = readFileSync(join(clientRuntimeDirectory, 'style.css'), 'utf-8')
  const scripts = clientRuntimeFiles.map((fileName) => readFileSync(join(clientRuntimeDirectory, fileName), 'utf-8'))

  return scripts.join('\n\n').replace('__WBX_CLIENT_STYLE__', JSON.stringify(style))
}
