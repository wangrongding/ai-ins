import { cpSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(packageRoot, 'src', 'client')
const target = join(packageRoot, 'dist', 'client')

rmSync(target, { force: true, recursive: true })
cpSync(source, target, { recursive: true })
