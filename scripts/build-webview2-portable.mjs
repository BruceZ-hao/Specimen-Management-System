import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDesktopAssets, copyIfExists, getBuildDateStamp, workspaceRoot } from './desktop-build-utils.mjs'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopSourceDir = resolve(workspaceRoot, 'apps', 'desktop-webview2')
const webView2PackageDir = resolve(workspaceRoot, '.webview2pkg')
const buildDateStamp = getBuildDateStamp()
const outputDirName = process.env.WEBVIEW2_OUTPUT_DIR || `dist-webview2-${buildDateStamp}`
const outputDir = resolve(workspaceRoot, outputDirName)
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const nodeExeSource = 'C:\\Program Files\\nodejs\\node.exe'

function cleanDir(target) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
}

function buildDesktopHost() {
  const exePath = resolve(outputDir, 'JNRon Sample Manager.exe')
  const references = [
    'System.dll',
    'System.Core.dll',
    'System.Drawing.dll',
    'System.IO.Compression.dll',
    'System.IO.Compression.FileSystem.dll',
    'System.Web.Extensions.dll',
    'System.Windows.Forms.dll',
    resolve(webView2PackageDir, 'lib', 'net462', 'Microsoft.Web.WebView2.Core.dll'),
    resolve(webView2PackageDir, 'lib', 'net462', 'Microsoft.Web.WebView2.WinForms.dll'),
  ]

  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    `/out:${exePath}`,
    `/win32icon:${resolve(workspaceRoot, 'apps', 'desktop', 'assets', 'app-icon.ico')}`,
    ...references.map((item) => `/reference:${item}`),
    resolve(desktopSourceDir, 'Program.cs'),
  ]

  execFileSync(cscPath, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
  })
}

cleanDir(outputDir)
buildDesktopAssets()
buildDesktopHost()

copyIfExists(resolve(webView2PackageDir, 'lib', 'net462', 'Microsoft.Web.WebView2.Core.dll'), resolve(outputDir, 'Microsoft.Web.WebView2.Core.dll'))
copyIfExists(resolve(webView2PackageDir, 'lib', 'net462', 'Microsoft.Web.WebView2.WinForms.dll'), resolve(outputDir, 'Microsoft.Web.WebView2.WinForms.dll'))
copyIfExists(resolve(webView2PackageDir, 'runtimes', 'win-x64', 'native', 'WebView2Loader.dll'), resolve(outputDir, 'WebView2Loader.dll'))
copyIfExists(nodeExeSource, resolve(outputDir, 'node.exe'))
copyIfExists(resolve(workspaceRoot, 'desktop-runtime'), resolve(outputDir, 'desktop-runtime'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'dist'), resolve(outputDir, 'apps', 'server', 'dist'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'prisma'), resolve(outputDir, 'apps', 'server', 'prisma'))
copyIfExists(resolve(workspaceRoot, 'apps', 'server', 'uploads'), resolve(outputDir, 'apps', 'server', 'uploads'))
copyIfExists(resolve(workspaceRoot, 'apps', 'admin', 'dist'), resolve(outputDir, 'apps', 'admin', 'dist'))

writeFileSync(
  resolve(outputDir, 'start-server.cmd'),
  [
    '@echo off',
    'setlocal',
    'cd /d %~dp0',
    'set "RUNTIME_ROOT=%~dp0runtime"',
    'set "UPLOAD_ROOT=%RUNTIME_ROOT%\\uploads"',
    'if not exist "%RUNTIME_ROOT%" mkdir "%RUNTIME_ROOT%"',
    'if not exist "%UPLOAD_ROOT%" mkdir "%UPLOAD_ROOT%"',
    'if not exist "%RUNTIME_ROOT%\\dev.db" copy /Y "%~dp0apps\\server\\prisma\\dev.db" "%RUNTIME_ROOT%\\dev.db" >nul',
    'set "DB_FILE=%RUNTIME_ROOT%\\dev.db"',
    'set "PORT=3000"',
    'set "HOST=127.0.0.1"',
    'set "JWT_SECRET=desktop-sample-management"',
    'set "DATABASE_URL=file:%DB_FILE:\\=/%"',
    'set "UPLOAD_DIR=%UPLOAD_ROOT%"',
    'set "ADMIN_DIST_DIR=%~dp0apps\\admin\\dist"',
    'set "NODE_PATH=%~dp0desktop-runtime\\node_modules"',
    'node.exe apps\\server\\dist\\apps\\server\\src\\main.js',
    '',
  ].join('\r\n'),
)

writeFileSync(
  resolve(outputDir, 'README.txt'),
  [
    'JNRon Sample Manager',
    '====================',
    '',
    `1. Keep the whole ${outputDirName} folder together.`,
    '2. Double-click "JNRon Sample Manager.exe".',
    '3. The app will start the local service and open the admin UI in WebView2.',
    '',
    'Persistent local data:',
    '- .\\runtime\\dev.db',
    '- .\\runtime\\uploads\\',
    '',
  ].join('\r\n'),
)
