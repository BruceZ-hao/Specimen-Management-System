import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSetupBootstrapper, buildZipArchive, copyIfExists, getBuildDateStamp, run, workspaceRoot } from './desktop-build-utils.mjs'

const buildDateStamp = getBuildDateStamp()
const portableDirName = process.env.WEBVIEW2_OUTPUT_DIR || `dist-webview2-${buildDateStamp}`
const setupBuildDirName = process.env.WEBVIEW2_SETUP_DIR || `dist-webview2-setup-${buildDateStamp}`
const portableDir = resolve(workspaceRoot, portableDirName)
const setupBuildDir = resolve(workspaceRoot, setupBuildDirName)
const stagingDir = resolve(setupBuildDir, 'staging')
const installerAssetsDir = resolve(setupBuildDir, 'installer-assets')
const packageZip = resolve(installerAssetsDir, 'app.zip')
const targetSetupPath = resolve(setupBuildDir, `JNRon-Sample-Manager-Setup-${buildDateStamp}.exe`)

function resetDir(target) {
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  mkdirSync(target, { recursive: true })
}

run('node', [resolve(workspaceRoot, 'scripts', 'build-webview2-portable.mjs')])

resetDir(setupBuildDir)
mkdirSync(stagingDir, { recursive: true })
mkdirSync(installerAssetsDir, { recursive: true })

copyIfExists(portableDir, stagingDir)

buildZipArchive(stagingDir, packageZip)

buildSetupBootstrapper(packageZip, targetSetupPath)
