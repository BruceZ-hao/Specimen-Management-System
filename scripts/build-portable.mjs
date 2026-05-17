import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDesktopAssets,
  cleanDir,
  copyIfExists,
  workspaceRoot,
} from './desktop-build-utils.mjs'

const portableRoot = resolve(workspaceRoot, 'dist-portable')

cleanDir(portableRoot)
buildDesktopAssets()

copyIfExists(process.execPath, resolve(portableRoot, 'node.exe'))
copyIfExists(resolve(workspaceRoot, 'node_modules'), resolve(portableRoot, 'node_modules'))
copyIfExists(resolve(workspaceRoot, 'apps/server/dist'), resolve(portableRoot, 'apps/server/dist'))
copyIfExists(resolve(workspaceRoot, 'apps/server/node_modules'), resolve(portableRoot, 'apps/server/node_modules'))
copyIfExists(resolve(workspaceRoot, 'apps/server/prisma'), resolve(portableRoot, 'apps/server/prisma'))
copyIfExists(resolve(workspaceRoot, 'apps/server/uploads'), resolve(portableRoot, 'apps/server/uploads'))
copyIfExists(resolve(workspaceRoot, 'apps/server/.env'), resolve(portableRoot, 'apps/server/.env'))
copyIfExists(resolve(workspaceRoot, 'apps/server/.env.example'), resolve(portableRoot, 'apps/server/.env.example'))
copyIfExists(resolve(workspaceRoot, 'apps/admin/dist'), resolve(portableRoot, 'apps/server/public/admin'))

writeFileSync(
  resolve(portableRoot, 'start.bat'),
  [
    '@echo off',
    'cd /d %~dp0',
    'if not exist apps\\server\\.env copy /Y apps\\server\\.env.example apps\\server\\.env >nul',
    'echo Starting sample management system...',
    'echo Open http://localhost:3000 in your browser after startup.',
    'node.exe apps\\server\\dist\\src\\main.js',
    '',
  ].join('\r\n'),
)

writeFileSync(
  resolve(portableRoot, 'README.txt'),
  [
    'Portable package usage',
    '======================',
    '',
    '1. Copy the whole dist-portable folder to another Windows computer.',
    '2. Double-click start.bat.',
    '3. Open http://localhost:3000 in a browser.',
    '',
    'Data files are kept here:',
    '- apps\\server\\prisma\\dev.db',
    '- apps\\server\\uploads\\',
    '',
    'If you need to change the port, edit apps\\server\\.env and restart.',
    '',
  ].join('\r\n'),
)
