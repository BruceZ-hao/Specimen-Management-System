import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  buildDesktopAssets,
  cleanDir,
  copyIfExists,
  getBuildDateStamp,
  workspaceRoot,
} from './desktop-build-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildDateStamp = getBuildDateStamp()
const packageVersion =
  String(process.env.UPDATE_PACKAGE_VERSION || '').trim() ||
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const stageDir = resolve(workspaceRoot, `.webview2-update-stage-${packageVersion}`)
const outputZipName = process.env.WEBVIEW2_UPDATE_PACKAGE || `dist-webview2-update-${buildDateStamp}.zip`
const outputZipPath = resolve(workspaceRoot, outputZipName)

const manifest = {
  version: packageVersion,
  createdAt: new Date().toISOString(),
  targets: [
    {
      source: 'apps/server/dist',
      destination: 'apps/server/dist',
      type: 'directory',
    },
    {
      source: 'apps/admin/dist',
      destination: 'apps/admin/dist',
      type: 'directory',
    },
    {
      source: 'packages/shared/dist',
      destination: 'desktop-runtime/node_modules/@sample/shared/dist',
      type: 'directory',
    },
    {
      source: 'packages/shared/package.json',
      destination: 'desktop-runtime/node_modules/@sample/shared/package.json',
      type: 'file',
    },
  ],
}

cleanDir(stageDir)
buildDesktopAssets()

copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'dist'), resolve(stageDir, 'apps', 'server', 'dist'))
copyIfExists(resolve(workspaceRoot, 'apps', 'admin', 'dist'), resolve(stageDir, 'apps', 'admin', 'dist'))
copyIfExists(resolve(workspaceRoot, 'packages', 'shared', 'dist'), resolve(stageDir, 'packages', 'shared', 'dist'))
copyIfExists(
  resolve(workspaceRoot, 'packages', 'shared', 'package.json'),
  resolve(stageDir, 'packages', 'shared', 'package.json'),
)
writeFileSync(resolve(stageDir, 'update-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

if (existsSync(outputZipPath)) {
  rmSync(outputZipPath, { force: true })
}

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${outputZipPath}' -Force`,
  ],
  {
    cwd: workspaceRoot,
    stdio: 'inherit',
  },
)

rmSync(stageDir, { recursive: true, force: true })
console.log(`Created ${outputZipPath}`)
