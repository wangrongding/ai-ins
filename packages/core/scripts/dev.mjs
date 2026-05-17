import { spawn } from 'child_process'

const processes = [
  spawn(
    'pnpm',
    [
      'exec',
      'esbuild',
      'src/client-panel/runtime.tsx',
      '--bundle',
      '--format=esm',
      '--platform=browser',
      '--target=es2022',
      '--jsx=automatic',
      '--define:process.env.NODE_ENV="production"',
      '--minify',
      '--outfile=src/client/react-panel.generated.js',
      '--watch',
    ],
    { stdio: 'inherit' },
  ),
  spawn(
    'pnpm',
    [
      'exec',
      'tsup',
      'src/index.ts',
      '--format',
      'esm,cjs',
      '--dts',
      '--sourcemap',
      '--shims',
      '--watch',
      '--onSuccess',
      'pnpm copy-client',
    ],
    { stdio: 'inherit' },
  ),
]

let shuttingDown = false

function stopAll(code = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

for (const child of processes) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0 && signal !== 'SIGTERM') {
      stopAll(code ?? 1)
    }
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
