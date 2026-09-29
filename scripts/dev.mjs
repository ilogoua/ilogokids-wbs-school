import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const processes = [
  spawn('npm', ['--prefix', 'server', 'run', 'dev'], { cwd: root, stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'client', 'run', 'dev', '--', '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit' }),
]

const stop = () => {
  for (const child of processes) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
    stop()
  })
}
