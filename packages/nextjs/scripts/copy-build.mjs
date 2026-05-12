import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const files = ['client-entry.js', 'source-loader.cjs']

for (const file of files) {
  const target = join('dist', file)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join('src', file), target)
}
