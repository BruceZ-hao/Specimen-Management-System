const { app, BrowserWindow, dialog } = require('electron')
const { appendFileSync, cpSync, existsSync, mkdirSync } = require('node:fs')
const Module = require('node:module')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const net = require('node:net')

const SERVER_PORT = 3000
const SERVER_HOST = '127.0.0.1'
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const SERVER_START_TIMEOUT_MS = 30000
const SERVER_CHECK_INTERVAL_MS = 500

let mainWindow = null
let isQuitting = false
let serverOutput = ''
let serverStarted = false
const startupLogPath = resolve(process.env.TEMP || tmpdir(), 'jnron-desktop-startup.log')

function writeStartupLog(message) {
  try {
    appendFileSync(startupLogPath, `[${new Date().toISOString()}] ${message}\n`)
  } catch (_error) {
    // Best-effort logging only.
  }
}

writeStartupLog(`boot pid=${process.pid} packaged=${app.isPackaged} resources=${process.resourcesPath}`)

process.on('uncaughtException', (error) => {
  writeStartupLog(`uncaughtException ${error && error.stack ? error.stack : String(error)}`)
})

process.on('unhandledRejection', (error) => {
  writeStartupLog(`unhandledRejection ${error && error.stack ? error.stack : String(error)}`)
})

function getAppRoot() {
  return app.isPackaged ? resolve(process.resourcesPath, 'app') : resolve(__dirname, '..', '..')
}

function getRuntimeRoot() {
  return app.isPackaged ? resolve(process.resourcesPath, 'app') : getAppRoot()
}

function ensureRuntimeData() {
  const runtimeRoot = join(app.getPath('userData'), 'runtime')
  const dbPath = join(runtimeRoot, 'dev.db')
  const uploadsPath = join(runtimeRoot, 'uploads')
  const bundledRuntimeRoot = getRuntimeRoot()
  const seedDbPath = resolve(bundledRuntimeRoot, 'apps', 'server', 'prisma', 'dev.db')
  const seedUploadsPath = resolve(bundledRuntimeRoot, 'apps', 'server', 'uploads')

  mkdirSync(runtimeRoot, { recursive: true })
  mkdirSync(uploadsPath, { recursive: true })

  if (!existsSync(dbPath) && existsSync(seedDbPath)) {
    cpSync(seedDbPath, dbPath)
  }

  if (existsSync(seedUploadsPath)) {
    cpSync(seedUploadsPath, uploadsPath, { recursive: true, force: false, errorOnExist: false })
  }

  return {
    dbPath,
    uploadsPath,
    adminDistPath: resolve(bundledRuntimeRoot, 'apps', 'admin', 'dist'),
    serverEntryPath: resolve(
      bundledRuntimeRoot,
      'apps',
      'server',
      'dist',
      'apps',
      'server',
      'src',
      'main.js',
    ),
    workingDirectory: bundledRuntimeRoot,
  }
}

function toPrismaSqliteUrl(dbPath) {
  return `file:${dbPath.replace(/\\/g, '/')}`
}

function appendServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk}`.slice(-8000)
}

function startServer() {
  if (serverStarted) {
    return
  }

  const { dbPath, uploadsPath, adminDistPath, serverEntryPath, workingDirectory } = ensureRuntimeData()
  const runtimeNodeModules = app.isPackaged
    ? resolve(process.resourcesPath, 'desktop-runtime', 'node_modules')
    : resolve(workingDirectory, 'desktop-runtime', 'node_modules')

  process.env.PORT = String(SERVER_PORT)
  process.env.HOST = SERVER_HOST
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'desktop-sample-management'
  process.env.DATABASE_URL = toPrismaSqliteUrl(dbPath)
  process.env.UPLOAD_DIR = uploadsPath
  process.env.ADMIN_DIST_DIR = adminDistPath
  process.env.NODE_PATH = runtimeNodeModules
  process.chdir(workingDirectory)
  Module._initPaths()

  appendServerOutput(
    [
      `cwd=${workingDirectory}`,
      `db=${dbPath}`,
      `uploads=${uploadsPath}`,
      `admin=${adminDistPath}`,
      `node_path=${runtimeNodeModules}`,
      `entry=${serverEntryPath}`,
    ].join('\n'),
  )

  try {
    writeStartupLog(`startServer entry=${serverEntryPath}`)
    require(serverEntryPath)
    serverStarted = true
    writeStartupLog('startServer ok')
  } catch (error) {
    appendServerOutput(`\n${error instanceof Error ? error.stack || error.message : String(error)}`)
    writeStartupLog(`startServer fail ${error instanceof Error ? error.stack || error.message : String(error)}`)
    throw error
  }
}

function stopServer() {
  serverStarted = false
}

function waitForServer() {
  const startedAt = Date.now()

  return new Promise((resolvePromise, rejectPromise) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: SERVER_HOST, port: SERVER_PORT })

      socket.once('connect', () => {
        socket.destroy()
        resolvePromise()
      })

      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - startedAt >= SERVER_START_TIMEOUT_MS) {
          rejectPromise(new Error('Timed out waiting for the local server to start.'))
          return
        }
        setTimeout(tryConnect, SERVER_CHECK_INTERVAL_MS)
      })
    }

    tryConnect()
  })
}

function createWindow() {
  writeStartupLog('createWindow begin')
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    writeStartupLog('createWindow ready-to-show')
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(SERVER_URL)
  writeStartupLog(`createWindow loadURL ${SERVER_URL}`)
}

function showStartupError(message) {
  writeStartupLog(`showStartupError ${message}`)
  dialog.showErrorBox(
    'Desktop startup failed',
    `${message}\n\nRecent server output:\n${serverOutput || '(no output)'}`,
  )
  app.quit()
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    writeStartupLog('whenReady begin')
    app.setAppUserModelId('com.note.desktop.sample-management')
    try {
      startServer()
      await waitForServer()
      writeStartupLog('waitForServer ok')
      createWindow()
    } catch (error) {
      showStartupError(error instanceof Error ? error.message : 'Unknown startup error.')
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    isQuitting = true
    stopServer()
  })
}
