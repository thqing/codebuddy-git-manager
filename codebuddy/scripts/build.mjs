import { build, context } from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const watch = process.argv.includes('--watch')

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}

const builds = [
  {
    ...common,
    entryPoints: [path.join(root, 'src/extension.js')],
    outfile: path.join(root, 'dist/extension.cjs'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: [path.join(root, 'src/webview/main.js')],
    outfile: path.join(root, 'dist/webview.js'),
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
  },
]

await rm(path.join(root, 'dist'), { recursive: true, force: true })
await mkdir(path.join(root, 'dist'), { recursive: true })

if (!watch) {
  await Promise.all(builds.map((options) => build(options)))
  process.exit(0)
}

const contexts = await Promise.all(builds.map((options) => context(options)))
await Promise.all(contexts.map((item) => item.watch()))
console.log('Watching extension and Webview sources…')
