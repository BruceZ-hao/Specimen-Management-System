import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(__dirname, '..')
const sourcePngPath = resolve(
  workspaceRoot,
  'apps',
  'miniprogram',
  'src',
  'static',
  'branding',
  'icon-512.png',
)
const outputIcoPath = resolve(workspaceRoot, 'apps', 'desktop', 'assets', 'app-icon.ico')

const pngBytes = readFileSync(sourcePngPath)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)

const directory = Buffer.alloc(16)
directory.writeUInt8(0, 0)
directory.writeUInt8(0, 1)
directory.writeUInt8(0, 2)
directory.writeUInt8(0, 3)
directory.writeUInt16LE(1, 4)
directory.writeUInt16LE(32, 6)
directory.writeUInt32LE(pngBytes.length, 8)
directory.writeUInt32LE(header.length + directory.length, 12)

mkdirSync(dirname(outputIcoPath), { recursive: true })
writeFileSync(outputIcoPath, Buffer.concat([header, directory, pngBytes]))
