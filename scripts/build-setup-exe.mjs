import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSetupBootstrapper, buildZipArchive, copyIfExists, run, workspaceRoot } from './desktop-build-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distElectronDir = resolve(workspaceRoot, 'dist-electron')
const unpackedDir = resolve(distElectronDir, 'win-unpacked')
const setupBuildDir = resolve(workspaceRoot, 'dist-setup')
const stagingDir = resolve(setupBuildDir, 'staging')
const installerAssetsDir = resolve(setupBuildDir, 'installer-assets')
const packageZip = resolve(installerAssetsDir, 'app.zip')
const targetSetupPath = resolve(setupBuildDir, 'JNRon-Sample-Manager-Setup-1.0.0.exe')

function resetDir(target) {
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  mkdirSync(target, { recursive: true })
}

run('node', [resolve(__dirname, 'build-electron-unpacked.mjs')])

resetDir(setupBuildDir)
mkdirSync(stagingDir, { recursive: true })
mkdirSync(installerAssetsDir, { recursive: true })

copyIfExists(unpackedDir, stagingDir)

buildZipArchive(stagingDir, packageZip)

buildSetupBootstrapper(packageZip, targetSetupPath)
