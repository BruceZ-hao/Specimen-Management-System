import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import extractZip from 'extract-zip'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, extname, join, resolve } from 'path'

export type ApkListItem = {
  name: string
  path: string
  updatedAt: Date
  sizeBytes: number
}

export type ApkVersionInfo = {
  versionName: string
  versionCode: string
  releaseNotes: string
}

export type AppReleaseSource = 'uploaded' | 'legacy-file'

type StoredAppReleaseRecord = {
  id: string
  source: 'uploaded'
  fileName: string
  storedFileName: string
  relativeFilePath: string
  versionName: string
  versionCode: string
  releaseNotes: string
  uploadedAt: string
  sizeBytes: number
}

export type AppReleaseItem = {
  id: string
  source: AppReleaseSource
  fileName: string
  versionName: string
  versionCode: string
  releaseNotes: string
  uploadedAt: Date
  sizeBytes: number
  absolutePath: string
}

export type AppReleaseState = {
  mode: 'uploaded' | 'legacy'
  items: AppReleaseItem[]
  currentReleaseId: string
}

type AppReleaseIndex = {
  currentReleaseId: string
  items: StoredAppReleaseRecord[]
}

type ParsedUpdateManifest = {
  versionName: string
  versionCode: string
  releaseNotes: string
}

@Injectable()
export class SystemService {
  constructor(private readonly configService: ConfigService) {}

  async listApks(): Promise<ApkListItem[]> {
    const apkDir = resolve(
      process.cwd(),
      this.configService.get('APK_RELEASE_DIR', 'apps/miniprogram/src/unpackage/release/apk'),
    )

    try {
      const entries = await readdir(apkDir, { withFileTypes: true })
      const apkFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.apk'))

      const files = await Promise.all(
        apkFiles.map(async (entry) => {
          const filePath = resolve(apkDir, entry.name)
          const fileStats = await stat(filePath)
          return {
            name: entry.name,
            path: filePath,
            updatedAt: fileStats.mtime,
            sizeBytes: fileStats.size,
          }
        }),
      )

      files.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      return files
    } catch {
      return []
    }
  }

  async getSelectedApkName() {
    const selectionFile = this.getSelectionFilePath()

    try {
      const raw = await readFile(selectionFile, 'utf8')
      const parsed = JSON.parse(raw) as { selectedApkName?: string }
      return String(parsed?.selectedApkName || '').trim()
    } catch {
      return ''
    }
  }

  async setSelectedApkName(name: string) {
    const selectionFile = this.getSelectionFilePath()
    await mkdir(dirname(selectionFile), { recursive: true })
    await writeFile(
      selectionFile,
      JSON.stringify(
        {
          selectedApkName: String(name || '').trim(),
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  async getCurrentApk() {
    const apkList = await this.listApks()
    if (!apkList.length) {
      return null
    }

    const selectedName = await this.getSelectedApkName()
    return apkList.find((item) => item.name === selectedName) || apkList[0]
  }

  async getCurrentApkVersionInfo(apk?: ApkListItem | null): Promise<ApkVersionInfo> {
    const metadata =
      (apk ? await this.readApkSidecarMetadata(apk) : null) ||
      (await this.readManifestVersionInfo(
        resolve(
          process.cwd(),
          this.configService.get(
            'APP_PLUS_BUILD_MANIFEST_PATH',
            'apps/miniprogram/src/unpackage/dist/build/app-plus/manifest.json',
          ),
        ),
      )) ||
      (await this.readManifestVersionInfo(
        resolve(process.cwd(), this.configService.get('APP_PLUS_SOURCE_MANIFEST_PATH', 'apps/miniprogram/src/manifest.json')),
      ))

    return (
      metadata || {
        versionName: '',
        versionCode: '',
        releaseNotes: '',
      }
    )
  }

  async getAppReleaseState(): Promise<AppReleaseState> {
    const uploaded = await this.listUploadedAppReleases()
    if (uploaded.length) {
      const index = await this.readAppReleaseIndex()
      const currentReleaseId =
        uploaded.find((item) => item.id === index.currentReleaseId)?.id || uploaded[0].id

      return {
        mode: 'uploaded',
        items: uploaded,
        currentReleaseId,
      }
    }

    const legacyItems = await this.listLegacyAppReleases()
    const currentLegacyRelease = await this.getCurrentLegacyAppRelease()

    return {
      mode: 'legacy',
      items: legacyItems,
      currentReleaseId: currentLegacyRelease?.id || legacyItems[0]?.id || '',
    }
  }

  async getCurrentAppRelease() {
    const state = await this.getAppReleaseState()
    return state.items.find((item) => item.id === state.currentReleaseId) || state.items[0] || null
  }

  async getAppReleaseById(id: string) {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) {
      throw new NotFoundException('未找到指定的移动端版本。')
    }

    const state = await this.getAppReleaseState()
    const matched = state.items.find((item) => item.id === normalizedId)
    if (!matched) {
      throw new NotFoundException('未找到指定的移动端版本。')
    }

    return matched
  }

  async uploadAppReleasePackage(file: Express.Multer.File) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('请先选择 ZIP 更新包。')
    }

    const originalName = String(file.originalname || '').trim()
    if (extname(originalName).toLowerCase() !== '.zip') {
      throw new BadRequestException('移动端更新包必须是 ZIP 文件。')
    }

    const storageRoot = this.getAppReleaseStorageRoot()
    const tempRoot = resolve(storageRoot, '.tmp', randomUUID())
    const tempZipPath = resolve(tempRoot, 'package.zip')
    const extractedRoot = resolve(tempRoot, 'extracted')

    await mkdir(extractedRoot, { recursive: true })
    await writeFile(tempZipPath, file.buffer)

    try {
      await extractZip(tempZipPath, { dir: extractedRoot })
      const extractedFiles = await this.collectFiles(extractedRoot)
      const apkFiles = extractedFiles.filter((entry) => extname(entry).toLowerCase() === '.apk')
      const manifestFiles = extractedFiles.filter((entry) => basename(entry).toLowerCase() === 'update.json')

      if (apkFiles.length !== 1) {
        throw new BadRequestException('ZIP 包内必须且只能包含 1 个 APK 文件。')
      }
      if (manifestFiles.length !== 1) {
        throw new BadRequestException('ZIP 包内必须且只能包含 1 个 update.json 文件。')
      }

      const parsedManifest = this.parseUpdateManifest(await this.readJsonFile(manifestFiles[0]))
      const releaseId = this.buildAppReleaseId()
      const apkSourcePath = apkFiles[0]
      const apkFileName = basename(apkSourcePath)
      const targetDir = resolve(storageRoot, 'files', releaseId)
      const storedFileName = apkFileName || 'package.apk'
      const targetApkPath = resolve(targetDir, storedFileName)
      const targetManifestPath = resolve(targetDir, 'update.json')

      await mkdir(targetDir, { recursive: true })
      await copyFile(apkSourcePath, targetApkPath)
      await copyFile(manifestFiles[0], targetManifestPath)

      const fileStats = await stat(targetApkPath)
      const releaseRecord: StoredAppReleaseRecord = {
        id: releaseId,
        source: 'uploaded',
        fileName: apkFileName,
        storedFileName,
        relativeFilePath: join('files', releaseId, storedFileName).replaceAll('\\', '/'),
        versionName: parsedManifest.versionName,
        versionCode: parsedManifest.versionCode,
        releaseNotes: parsedManifest.releaseNotes,
        uploadedAt: new Date().toISOString(),
        sizeBytes: fileStats.size,
      }

      const currentIndex = await this.readAppReleaseIndex()
      const nextIndex: AppReleaseIndex = {
        currentReleaseId: releaseId,
        items: [releaseRecord, ...currentIndex.items.filter((item) => item.id !== releaseId)],
      }

      await this.writeAppReleaseIndex(nextIndex)
      return this.resolveUploadedRecord(releaseRecord)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  async activateAppRelease(id: string) {
    const state = await this.getAppReleaseState()
    const matched = state.items.find((item) => item.id === String(id || '').trim())

    if (!matched) {
      throw new NotFoundException('未找到指定的移动端版本。')
    }

    if (matched.source === 'uploaded') {
      const currentIndex = await this.readAppReleaseIndex()
      await this.writeAppReleaseIndex({
        ...currentIndex,
        currentReleaseId: matched.id,
      })
      return matched
    }

    await this.setSelectedApkName(matched.fileName)
    return matched
  }

  async deleteAppRelease(id: string) {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) {
      throw new NotFoundException('未找到指定的移动端版本。')
    }

    if (normalizedId.startsWith('legacy:')) {
      throw new BadRequestException('目录兼容模式的 APK 不能在这里删除，请直接清理服务器目录中的文件。')
    }

    const currentIndex = await this.readAppReleaseIndex()
    const matched = currentIndex.items.find((item) => item.id === normalizedId)

    if (!matched) {
      throw new NotFoundException('未找到指定的移动端版本。')
    }

    if (currentIndex.currentReleaseId === normalizedId) {
      throw new BadRequestException('当前分发版本不能删除，请先切换到其他版本。')
    }

    const nextItems = currentIndex.items.filter((item) => item.id !== normalizedId)
    const nextCurrentReleaseId = nextItems.some((item) => item.id === currentIndex.currentReleaseId)
      ? currentIndex.currentReleaseId
      : nextItems[0]?.id || ''

    await this.writeAppReleaseIndex({
      currentReleaseId: nextCurrentReleaseId,
      items: nextItems,
    })

    const releaseDir = resolve(this.getAppReleaseStorageRoot(), 'files', matched.id)
    await rm(releaseDir, { recursive: true, force: true }).catch(() => undefined)

    return {
      id: matched.id,
    }
  }

  async getManualPublicBaseUrl() {
    const overrideFile = this.getPublicBaseUrlFilePath()

    try {
      const raw = await readFile(overrideFile, 'utf8')
      const parsed = JSON.parse(raw) as { publicBaseUrl?: string }
      return String(parsed?.publicBaseUrl || '').trim()
    } catch {
      return ''
    }
  }

  async setManualPublicBaseUrl(value: string) {
    const overrideFile = this.getPublicBaseUrlFilePath()
    await mkdir(dirname(overrideFile), { recursive: true })
    await writeFile(
      overrideFile,
      JSON.stringify(
        {
          publicBaseUrl: String(value || '').trim(),
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  async getCpolarPublicBaseUrlFromLogs() {
    const logFiles = await this.getCpolarLogFiles()

    for (const filePath of logFiles) {
      const publicBaseUrl = await this.extractCpolarPublicBaseUrlFromLogFile(filePath)
      if (publicBaseUrl) {
        return publicBaseUrl
      }
    }

    return ''
  }

  private async listUploadedAppReleases(): Promise<AppReleaseItem[]> {
    const index = await this.readAppReleaseIndex()
    const resolvedItems = await Promise.all(index.items.map((item) => this.resolveUploadedRecord(item).catch(() => null)))
    const items = resolvedItems.filter((item): item is AppReleaseItem => item !== null)

    return items.sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())
  }

  private async listLegacyAppReleases() {
    const apkList = await this.listApks()
    const items = await Promise.all(apkList.map((item) => this.toLegacyAppRelease(item)))
    items.sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())
    return items
  }

  private async getCurrentLegacyAppRelease() {
    const currentApk = await this.getCurrentApk()
    if (!currentApk) {
      return null
    }

    return this.toLegacyAppRelease(currentApk)
  }

  private async toLegacyAppRelease(apk: ApkListItem): Promise<AppReleaseItem> {
    const metadata = await this.getCurrentApkVersionInfo(apk)

    return {
      id: `legacy:${apk.name}`,
      source: 'legacy-file',
      fileName: apk.name,
      versionName: metadata.versionName,
      versionCode: metadata.versionCode,
      releaseNotes: metadata.releaseNotes,
      uploadedAt: apk.updatedAt,
      sizeBytes: apk.sizeBytes,
      absolutePath: apk.path,
    }
  }

  private async resolveUploadedRecord(record: StoredAppReleaseRecord): Promise<AppReleaseItem> {
    const absolutePath = resolve(this.getAppReleaseStorageRoot(), record.relativeFilePath)
    const fileStats = await stat(absolutePath)

    return {
      id: String(record.id || '').trim(),
      source: 'uploaded' as const,
      fileName: String(record.fileName || record.storedFileName || '').trim(),
      versionName: String(record.versionName || '').trim(),
      versionCode: String(record.versionCode || '').trim(),
      releaseNotes: String(record.releaseNotes || '').trim(),
      uploadedAt: new Date(record.uploadedAt || fileStats.mtime.toISOString()),
      sizeBytes: Number(record.sizeBytes || fileStats.size),
      absolutePath,
    }
  }

  private async readAppReleaseIndex(): Promise<AppReleaseIndex> {
    const indexPath = this.getAppReleaseIndexFilePath()

    try {
      const raw = await readFile(indexPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppReleaseIndex>
      const items = Array.isArray(parsed?.items)
        ? parsed.items
            .map((item) => this.normalizeStoredReleaseRecord(item))
            .filter((item): item is StoredAppReleaseRecord => Boolean(item))
        : []

      return {
        currentReleaseId: String(parsed?.currentReleaseId || '').trim(),
        items,
      }
    } catch {
      return {
        currentReleaseId: '',
        items: [],
      }
    }
  }

  private async writeAppReleaseIndex(payload: AppReleaseIndex) {
    const indexPath = this.getAppReleaseIndexFilePath()
    await mkdir(dirname(indexPath), { recursive: true })
    await writeFile(indexPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private normalizeStoredReleaseRecord(value: unknown) {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const id = String(raw.id || '').trim()
    const relativeFilePath = String(raw.relativeFilePath || '').trim()
    const storedFileName = String(raw.storedFileName || '').trim()
    const fileName = String(raw.fileName || storedFileName || '').trim()

    if (!id || !relativeFilePath || !fileName || !storedFileName) {
      return null
    }

    return {
      id,
      source: 'uploaded' as const,
      fileName,
      storedFileName,
      relativeFilePath,
      versionName: String(raw.versionName || '').trim(),
      versionCode: String(raw.versionCode || '').trim(),
      releaseNotes: this.normalizeReleaseNotes(raw.releaseNotes),
      uploadedAt: String(raw.uploadedAt || '').trim(),
      sizeBytes: Number(raw.sizeBytes || 0),
    }
  }

  private parseUpdateManifest(raw: Record<string, unknown> | null): ParsedUpdateManifest {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('update.json 解析失败，请检查文件内容。')
    }

    const versionName = String(raw.versionName || '').trim()
    const versionCode = String(raw.versionCode || '').trim()
    const releaseNotes = this.normalizeReleaseNotes(raw.releaseNotes)

    if (!versionName) {
      throw new BadRequestException('update.json 缺少 versionName。')
    }
    if (!versionCode) {
      throw new BadRequestException('update.json 缺少 versionCode。')
    }

    return {
      versionName,
      versionCode,
      releaseNotes,
    }
  }

  private buildAppReleaseId() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    return `release-${stamp}-${randomUUID().slice(0, 8)}`
  }

  private getSelectionFilePath() {
    return resolve(
      process.cwd(),
      this.configService.get('APK_SELECTION_FILE', 'apps/server/.apk-selection.json'),
    )
  }

  private getPublicBaseUrlFilePath() {
    return resolve(
      process.cwd(),
      this.configService.get('PUBLIC_BASE_URL_OVERRIDE_FILE', 'apps/server/.public-base-url.json'),
    )
  }

  private getAppReleaseStorageRoot() {
    return resolve(
      process.cwd(),
      this.configService.get('APP_RELEASE_STORAGE_DIR', 'apps/server/.app-releases'),
    )
  }

  private getAppReleaseIndexFilePath() {
    return resolve(this.getAppReleaseStorageRoot(), 'index.json')
  }

  private async getCpolarLogFiles() {
    const logDir = resolve(homedir(), '.cpolar', 'logs')

    try {
      const entries = await readdir(logDir, { withFileTypes: true })
      const candidates = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && /^cpolar_service\.log(?:\.\d{8})?$/.test(entry.name))
          .map(async (entry) => {
            const filePath = resolve(logDir, entry.name)
            const fileStats = await stat(filePath)
            return {
              filePath,
              updatedAt: fileStats.mtime.getTime(),
            }
          }),
      )

      return candidates.sort((left, right) => right.updatedAt - left.updatedAt).map((item) => item.filePath)
    } catch {
      return []
    }
  }

  private async extractCpolarPublicBaseUrlFromLogFile(filePath: string) {
    try {
      const raw = await readFile(filePath, 'utf8')
      const patterns = [
        /"PublicUrl":"(https?:\/\/[^"]+\.cpolar\.top)"/gi,
        /Tunnel established at (https?:\/\/[^\s"]+\.cpolar\.top)/gi,
      ]

      let latestMatch = ''
      for (const pattern of patterns) {
        let match: RegExpExecArray | null = null
        while ((match = pattern.exec(raw)) !== null) {
          latestMatch = this.normalizeUrl(match[1] || latestMatch)
        }

        if (latestMatch.startsWith('https://')) {
          return latestMatch
        }
      }

      return latestMatch
    } catch {
      return ''
    }
  }

  private async readApkSidecarMetadata(apk: ApkListItem) {
    const sidecarCandidates = [
      `${apk.path}.json`,
      resolve(dirname(apk.path), `${apk.name.slice(0, Math.max(0, apk.name.length - extname(apk.name).length))}.json`),
    ]

    for (const filePath of sidecarCandidates) {
      const metadata = this.extractVersionInfo(await this.readJsonFile(filePath))
      if (metadata) {
        return metadata
      }
    }

    return null
  }

  private async readManifestVersionInfo(filePath: string) {
    return this.extractVersionInfo(await this.readJsonFile(filePath))
  }

  private async readJsonFile(filePath: string) {
    try {
      const raw = await readFile(filePath, 'utf8')
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private extractVersionInfo(raw: Record<string, unknown> | null) {
    if (!raw || typeof raw !== 'object') {
      return null
    }

    const versionRecord =
      raw.version && typeof raw.version === 'object' ? (raw.version as Record<string, unknown>) : null
    const versionName = String(raw.versionName || versionRecord?.name || '').trim()
    const versionCode = String(raw.versionCode || versionRecord?.code || '').trim()
    const releaseNotes = this.normalizeReleaseNotes(raw.releaseNotes || raw.notes)

    if (!versionName && !versionCode && !releaseNotes) {
      return null
    }

    return {
      versionName,
      versionCode,
      releaseNotes,
    }
  }

  private normalizeReleaseNotes(value: unknown) {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('\n')
    }

    return String(value || '').trim()
  }

  private normalizeUrl(value: string) {
    return String(value || '')
      .trim()
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '')
  }

  private async collectFiles(rootDir: string): Promise<string[]> {
    const entries = await readdir(rootDir, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = resolve(rootDir, entry.name)
        if (entry.isDirectory()) {
          return this.collectFiles(absolutePath)
        }
        return absolutePath
      }),
    )

    return nested.flat()
  }
}
