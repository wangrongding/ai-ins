import { cpSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceFiles = ['client-entry.js', 'source-loader.cjs']
const targetDir = join(packageRoot, 'dist')

for (const fileName of sourceFiles) {
  const source = join(packageRoot, 'src', fileName)
  const target = join(targetDir, fileName)

  rmSync(target, { force: true })
  cpSync(source, target)
}
