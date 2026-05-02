import { readFileSync } from 'fs'
import { join } from 'path'

export const devInspectClientSource = readFileSync(join(__dirname, 'client-runtime.js'), 'utf-8')
