import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDesktopAssets, copyIfExists, run, workspaceRoot } from './desktop-build-utils.mjs'

const distElectronDir = resolve(workspaceRoot, 'dist-electron')
const unpackedDir = resolve(distElectronDir, 'win-unpacked')
const electronDistDir = resolve(workspaceRoot, 'node_modules', 'electron', 'dist')
const appDir = resolve(unpackedDir, 'resources', 'app')
const runtimeDir = resolve(unpackedDir, 'resources', 'desktop-runtime')

rmSync(unpackedDir, { recursive: true, force: true })
mkdirSync(unpackedDir, { recursive: true })

run('node', ['scripts/generate-desktop-icon.mjs'])
buildDesktopAssets()
copyIfExists(electronDistDir, unpackedDir)

renameSync(resolve(unpackedDir, 'electron.exe'), resolve(unpackedDir, 'JNRon Sample Manager.exe'))

mkdirSync(appDir, { recursive: true })
mkdirSync(runtimeDir, { recursive: true })

copyIfExists(resolve(workspaceRoot, 'apps', 'desktop'), resolve(appDir, 'apps', 'desktop'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'dist'), resolve(appDir, 'apps', 'server', 'dist'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'prisma'), resolve(appDir, 'apps', 'server', 'prisma'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'uploads'), resolve(appDir, 'apps', 'server', 'uploads'))
copyIfExists(resolve(workspaceRoot, 'apps', 'admin', 'dist'), resolve(appDir, 'apps', 'admin', 'dist'))
copyIfExists(resolve(workspaceRoot, 'desktop-runtime'), resolve(unpackedDir, 'resources', 'desktop-runtime'))

writeFileSync(
  resolve(appDir, 'package.json'),
  JSON.stringify(
    {
      name: 'jnron-sample-manager',
      productName: 'JNRon Sample Manager',
      version: '1.0.0',
      main: 'apps/desktop/main.cjs',
    },
    null,
    2,
  ),
)
