import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const workspaceRoot = resolve(__dirname, '..')

export function getBuildDateStamp() {
  const override = String(process.env.BUILD_DATE_STAMP || '').trim()
  if (/^\d{8}$/.test(override)) {
    return override
  }

  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function run(command, args, cwd = workspaceRoot, extraOptions = {}) {
  const invocation =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')]]
      : [command, args]

  execFileSync(invocation[0], invocation[1], {
    cwd,
    stdio: 'inherit',
    ...extraOptions,
  })
}

export function copyIfExists(source, target) {
  if (!existsSync(source)) {
    return
  }

  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true })
}

export function cleanDir(target) {
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  mkdirSync(target, { recursive: true })
}

export function materializeSharedRuntimePackage() {
  const runtimePackageRoot = resolve(workspaceRoot, 'apps/server/node_modules/@sample/shared')

  rmSync(runtimePackageRoot, { recursive: true, force: true })
  mkdirSync(runtimePackageRoot, { recursive: true })
  copyIfExists(resolve(workspaceRoot, 'packages/shared/dist'), resolve(runtimePackageRoot, 'dist'))
  copyIfExists(resolve(workspaceRoot, 'packages/shared/package.json'), resolve(runtimePackageRoot, 'package.json'))
}

export function materializeDesktopRuntimeNodeModules() {
  const desktopRuntimeRoot = resolve(workspaceRoot, 'desktop-runtime')
  const targetRoot = resolve(desktopRuntimeRoot, 'node_modules')
  const dependencyListPath = resolve(workspaceRoot, '.desktop-runtime-prod-deps.txt')
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `npm.cmd ls --workspace apps/server --omit=dev --parseable --all | Set-Content -LiteralPath '${dependencyListPath}' -Encoding UTF8`,
    ],
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
    },
  )
  const lsOutput = readFileSync(dependencyListPath, 'utf8').replace(/^\uFEFF/, '')
  const sourcePaths = lsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((item) => resolve(item))

  const candidateRelPaths = []
  for (const absolutePath of sourcePaths) {
    if (absolutePath === workspaceRoot) {
      continue
    }

    const rootRuntimePrefix = `${resolve(workspaceRoot, 'node_modules')}\\`
    const serverRuntimePrefix = `${resolve(workspaceRoot, 'apps', 'server', 'node_modules')}\\`

    if (absolutePath === resolve(workspaceRoot, 'node_modules', '@sample', 'server')) {
      continue
    }

    if (absolutePath.startsWith(rootRuntimePrefix)) {
      candidateRelPaths.push(absolutePath.slice(workspaceRoot.length + 1))
      continue
    }

    if (absolutePath.startsWith(serverRuntimePrefix)) {
      candidateRelPaths.push(`node_modules\\${absolutePath.slice(serverRuntimePrefix.length)}`)
    }
  }

  const normalizedRelPaths = candidateRelPaths
    .map((item) => item.replace(/\//g, '\\').replace(/\\+$/, ''))
    .filter(Boolean)
    .sort((left, right) => left.length - right.length)

  const selectedRelPaths = []
  for (const relPath of normalizedRelPaths) {
    if (selectedRelPaths.some((selected) => relPath === selected || relPath.startsWith(`${selected}\\`))) {
      continue
    }

    selectedRelPaths.push(relPath)
  }

  rmSync(targetRoot, { recursive: true, force: true })
  rmSync(dependencyListPath, { force: true })
  mkdirSync(desktopRuntimeRoot, { recursive: true })

  for (const relPath of selectedRelPaths) {
    const sourcePath = resolve(workspaceRoot, relPath)
    const targetPath = resolve(desktopRuntimeRoot, relPath)
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, targetPath, { recursive: true, dereference: true })
    }
  }

  copyIfExists(resolve(workspaceRoot, 'node_modules', '.prisma'), resolve(targetRoot, '.prisma'))
}

export function buildDesktopAssets() {
  run('npm.cmd', ['--workspace', 'packages/shared', 'run', 'build'])
  materializeSharedRuntimePackage()
  materializeDesktopRuntimeNodeModules()
  run('npm.cmd', ['--workspace', 'apps/server', 'run', 'build'])

  if (String(process.env.SKIP_ADMIN_BUILD || '').trim() === '1') {
    const adminDistDir = resolve(workspaceRoot, 'apps', 'admin', 'dist')
    if (!existsSync(adminDistDir)) {
      throw new Error('SKIP_ADMIN_BUILD=1 but apps/admin/dist does not exist')
    }
    return
  }

  run('npm.cmd', ['--workspace', 'apps/admin', 'run', 'build'])
}

function getWindowsCscPath() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Unable to locate csc.exe required for Windows setup compilation')
}

export function buildSetupBootstrapper(packageZip, targetSetupPath) {
  const cscPath = getWindowsCscPath()
  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    `/out:${targetSetupPath}`,
    `/win32icon:${resolve(workspaceRoot, 'apps', 'desktop', 'assets', 'app-icon.ico')}`,
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    `/resource:${packageZip},app.zip`,
    resolve(workspaceRoot, 'scripts', 'SetupStub.cs'),
  ]

  execFileSync(cscPath, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
  })
}

function getWindows7ZipPath() {
  const candidates = [
    resolve(workspaceRoot, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    resolve(workspaceRoot, 'node_modules', '7zip-bin', 'win', 'ia32', '7za.exe'),
    resolve(workspaceRoot, 'node_modules', '7zip-bin', 'win', 'arm64', '7za.exe'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Unable to locate bundled 7za.exe required for Windows setup packaging')
}

export function buildZipArchive(sourceDir, targetZipPath) {
  const sevenZipPath = getWindows7ZipPath()

  rmSync(targetZipPath, { force: true })
  execFileSync(sevenZipPath, ['a', '-tzip', targetZipPath, '*'], {
    cwd: sourceDir,
    stdio: 'inherit',
  })
}
