<template>
  <section class="settings-view">
    <div class="page-card settings-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">系统设置</div>
        <h2>服务器配置与更新</h2>
        <p>桌面端升级、移动端服务地址和版本分发都集中在这里维护，上传新的移动端 ZIP 后会立刻成为当前版本。</p>
        <div class="hero-meta">
          <span class="hero-badge">自动刷新已开启</span>
          <span>{{ lastRefreshAt ? `最近刷新：${formatRefreshTime(lastRefreshAt)}` : '正在读取当前配置...' }}</span>
        </div>
      </div>

      <div class="hero-actions">
        <el-button :loading="refreshing" @click="refreshSettings(true)">
          {{ refreshing ? '刷新中...' : '刷新设置' }}
        </el-button>
        <el-button type="primary" :loading="installingUpdate" @click="installUpdatePackage">
          {{ installingUpdate ? '正在安装...' : '安装后台更新包' }}
        </el-button>
      </div>
    </div>

    <div class="page-card settings-section">
      <div class="section-header">
        <div>
          <h3>桌面端更新</h3>
          <p>选择 update zip 后自动安装并重启本地服务，不会覆盖本地数据库和上传文件。</p>
        </div>
      </div>

      <div class="update-layout">
        <div class="status-list">
          <div class="status-row">
            <span class="info-label">运行环境</span>
            <span class="info-value">{{ desktopUpdateSupported ? '桌面端 WebView2' : '浏览器环境' }}</span>
          </div>
          <div class="status-row">
            <span class="info-label">当前提示</span>
            <span class="info-value">{{ updateMessage || '等待选择更新包。' }}</span>
          </div>
        </div>

        <div class="button-row">
          <el-button type="primary" :loading="installingUpdate" @click="installUpdatePackage">
            {{ installingUpdate ? '正在安装...' : '安装后台更新包' }}
          </el-button>
        </div>
      </div>
    </div>

    <div class="settings-grid">
      <div class="page-card settings-section">
        <div class="section-header">
          <div>
            <h3>移动端服务地址</h3>
            <p>旧版 App 继续扫描这里的服务器二维码，写入地址后会按现有逻辑弹出更新提示。</p>
          </div>
          <button class="ghost-link" type="button" :disabled="refreshing" @click="refreshSettings(true)">
            {{ refreshing ? '刷新中...' : '重新识别' }}
          </button>
        </div>

        <div class="info-block" :title="publicBaseUrl || emptyText">
          {{ publicBaseUrl || emptyText }}
        </div>

        <div class="form-block">
          <div class="info-label">手动填写地址</div>
          <div class="input-row">
            <el-input
              v-model="manualPublicBaseUrlInput"
              placeholder="例如 https://2270e4.r27.cpolar.top"
              clearable
            />
            <el-button type="primary" :loading="savingManualUrl" @click="saveManualPublicBaseUrl">
              保存地址
            </el-button>
            <el-button :disabled="!manualPublicBaseUrlInput" @click="clearManualPublicBaseUrl">清空</el-button>
          </div>
        </div>

        <div class="qr-layout">
          <div v-if="serverConfigQrCodeDataUrl" class="qr-card">
            <img class="qr-image" :src="serverConfigQrCodeDataUrl" alt="服务器配置二维码" />
          </div>
          <div v-else class="qr-empty">识别到公网地址后会自动生成服务器二维码。</div>

          <div class="qr-actions">
            <div class="info-label">服务器配置二维码</div>
            <div class="helper-text">这个二维码给旧版 App 扫码配网，扫码结果会被当成服务器地址保存。</div>
            <div class="button-row">
              <el-button size="small" :disabled="!publicBaseUrl" @click="copyPublicUrl">复制地址</el-button>
              <el-button size="small" :disabled="!appLinkUrl" @click="openAppLinkPage">打开配网页</el-button>
              <el-button
                size="small"
                :disabled="!serverConfigQrCodeDataUrl"
                @click="downloadDataUrlAsFile(serverConfigQrCodeDataUrl, 'jnron-server-qr.png')"
              >
                下载二维码
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="page-card settings-section">
        <div class="section-header">
          <div>
            <h3>当前移动端版本</h3>
            <p>外部扫码请用这里的下载二维码；旧版 App 内不识别这个二维码，仍请扫描左侧服务器二维码。</p>
          </div>
        </div>

        <div class="apk-summary">
          <div class="summary-item">
            <span class="info-label">当前生效版本</span>
            <strong>{{ currentRelease?.versionName || currentRelease?.fileName || '暂无版本' }}</strong>
          </div>
          <div class="summary-item">
            <span class="info-label">版本代码</span>
            <strong>{{ currentRelease?.versionCode || '-' }}</strong>
          </div>
          <div class="summary-item">
            <span class="info-label">更新时间</span>
            <strong>{{ formatApkUpdatedAt(currentRelease?.uploadedAt || '') }}</strong>
          </div>
          <div class="summary-item">
            <span class="info-label">来源</span>
            <strong>{{ currentRelease ? formatReleaseSource(currentRelease.source) : '-' }}</strong>
          </div>
        </div>

        <div class="form-block">
          <div class="info-label">当前下载地址</div>
          <div class="info-block" :title="currentReleaseDownloadUrl || apkEmptyText">
            {{ currentReleaseDownloadUrl || apkEmptyText }}
          </div>
        </div>

        <div class="form-block">
          <div class="info-label">当前下载页</div>
          <div class="info-block" :title="currentReleaseDownloadPageUrl || releaseQrHintText">
            {{ currentReleaseDownloadPageUrl || releaseQrHintText }}
          </div>
        </div>

        <div class="qr-layout">
          <div v-if="releaseQrCodeDataUrl" class="qr-card">
            <img class="qr-image" :src="releaseQrCodeDataUrl" alt="移动端下载二维码" />
          </div>
          <div v-else class="qr-empty">{{ releaseQrHintText }}</div>

          <div class="qr-actions">
            <div class="info-label">移动端下载二维码</div>
            <div class="helper-text">手机系统相机、微信或浏览器扫码后会打开当前版本下载页，再下载并安装 APK。</div>
            <div class="button-row">
              <el-button size="small" :disabled="!currentReleaseDownloadUrl" @click="copyApkUrl">
                复制下载链接
              </el-button>
              <el-button size="small" :disabled="!currentReleaseDownloadPageUrl" @click="openCurrentReleasePage">
                打开下载页
              </el-button>
              <el-button
                size="small"
                :disabled="!releaseQrCodeDataUrl"
                @click="downloadDataUrlAsFile(releaseQrCodeDataUrl, 'jnron-release-qr.png')"
              >
                下载二维码
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="page-card settings-section release-section">
      <div class="section-header">
        <div>
          <h3>移动端版本管理</h3>
          <p>上传 ZIP 更新包后自动生效，并保留历史版本供回切。ZIP 内固定包含 1 个 APK 和 1 个 update.json。</p>
        </div>
      </div>

      <div class="release-toolbar">
        <div class="upload-copy">
          <div class="info-label">上传规则</div>
          <div class="helper-text">
            `update.json` 需要带 `versionName`、`versionCode`，`releaseNotes` 可以是字符串或字符串数组。
          </div>
          <div class="helper-banner">{{ releaseModeDescription }}</div>
        </div>

        <div class="release-toolbar-actions">
          <el-upload
            accept=".zip"
            :auto-upload="false"
            :show-file-list="false"
            :before-upload="preventAutoUpload"
            :on-change="handleReleaseFileChange"
          >
            <el-button>选择 ZIP 更新包</el-button>
          </el-upload>
          <el-button :disabled="!selectedReleaseZipFile" @click="clearSelectedReleaseFile">清空选择</el-button>
          <el-button type="primary" :loading="uploadingRelease" :disabled="!selectedReleaseZipFile" @click="submitReleaseUpload">
            {{ uploadingRelease ? '上传中...' : '上传并生效' }}
          </el-button>
        </div>
      </div>

      <div v-if="selectedReleaseZipName" class="info-block" :title="selectedReleaseZipName">
        已选择：{{ selectedReleaseZipName }}
      </div>

      <div v-if="appReleases.length" class="release-list">
        <article
          v-for="release in appReleases"
          :key="release.id"
          class="release-item"
          :class="{ 'release-item-active': release.isCurrent }"
        >
          <div class="release-main">
            <div class="release-head">
              <div>
                <div class="release-title">{{ release.versionName || release.fileName }}</div>
                <div class="release-subtitle">{{ release.fileName }}</div>
              </div>

              <div class="release-badges">
                <span v-if="release.isCurrent" class="release-badge release-badge-active">当前版本</span>
                <span class="release-badge">{{ formatReleaseSource(release.source) }}</span>
              </div>
            </div>

            <div class="release-meta-grid">
              <div class="release-meta-item">
                <span class="info-label">版本代码</span>
                <strong>{{ release.versionCode || '-' }}</strong>
              </div>
              <div class="release-meta-item">
                <span class="info-label">更新时间</span>
                <strong>{{ formatApkUpdatedAt(release.uploadedAt) }}</strong>
              </div>
              <div class="release-meta-item">
                <span class="info-label">包大小</span>
                <strong>{{ formatFileSize(release.sizeBytes) || '-' }}</strong>
              </div>
            </div>

            <div class="release-notes" :class="{ 'release-notes-muted': !release.releaseNotes }">
              {{ release.releaseNotes || '暂无更新说明' }}
            </div>
          </div>

          <div class="release-actions">
            <el-button size="small" :disabled="!release.downloadPageUrl" @click="openReleasePage(release)">打开下载页</el-button>
            <el-button size="small" :disabled="!release.downloadUrl" @click="copyReleaseDownloadUrl(release)">复制下载链接</el-button>
            <el-button
              size="small"
              type="primary"
              plain
              :loading="activatingReleaseId === release.id"
              :disabled="release.isCurrent"
              @click="setCurrentRelease(release)"
            >
              设为当前版本
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :loading="deletingReleaseId === release.id"
              :disabled="release.isCurrent || release.source !== 'uploaded' || !!deletingReleaseId"
              @click="removeRelease(release)"
            >
              删除版本
            </el-button>
          </div>
        </article>
      </div>

      <div v-else class="qr-empty">当前还没有可用的移动端版本。</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile, UploadRawFile } from 'element-plus'
import QRCode from 'qrcode'
import {
  activateAppRelease,
  deleteAppRelease,
  getAppReleases,
  getClientConfig,
  setPublicBaseUrl,
  uploadAppRelease,
} from '@/api/system'

type AppReleaseItem = {
  id: string
  source: 'uploaded' | 'legacy-file'
  fileName: string
  versionName: string
  versionCode: string
  releaseNotes: string
  uploadedAt: string
  sizeBytes: number
  isCurrent: boolean
  downloadUrl: string
  downloadPageUrl: string
}

type WebViewMessage = {
  type?: string
  success?: boolean
  cancelled?: boolean
  message?: string
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void
        addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
        removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
      }
    }
  }
}

const publicBaseUrl = ref('')
const manualPublicBaseUrlInput = ref('')
const appLinkUrl = ref('')
const appDownloadUrl = ref('')
const serverConfigQrCodeDataUrl = ref('')
const releaseQrCodeDataUrl = ref('')
const lastRefreshAt = ref('')
const refreshing = ref(false)
const savingManualUrl = ref(false)
const installingUpdate = ref(false)
const updateMessage = ref('')
const desktopUpdateSupported = ref(false)
const releaseMode = ref<'uploaded' | 'legacy'>('legacy')
const appReleases = ref<AppReleaseItem[]>([])
const uploadingRelease = ref(false)
const selectedReleaseZipFile = ref<File | null>(null)
const selectedReleaseZipName = ref('')
const activatingReleaseId = ref('')
const deletingReleaseId = ref('')
const emptyText = '还没有识别到可用地址，请先启动 cpolar 或手动填写。'
const apkEmptyText = '当前没有可用的 APK 下载地址'
let refreshTimer: ReturnType<typeof setInterval> | null = null

const currentRelease = computed(() => appReleases.value.find((item) => item.isCurrent) || null)

const currentReleaseDownloadUrl = computed(() => {
  return currentRelease.value?.downloadUrl || appDownloadUrl.value || ''
})

const currentReleaseDownloadPageUrl = computed(() => {
  return currentRelease.value?.downloadPageUrl || ''
})

const releaseModeDescription = computed(() => {
  if (releaseMode.value === 'uploaded') {
    return '当前已切换到后台版本库管理，新上传的 ZIP 会自动成为当前分发版本。'
  }

  return '当前仍在兼容服务器目录里的 APK。上传第一个 ZIP 后，这里会自动切换到后台版本库。'
})

const releaseQrHintText = computed(() => {
  if (!currentRelease.value) {
    return '当前还没有可下载的移动端版本。'
  }
  if (!publicBaseUrl.value) {
    return '请先配置公网地址，再生成给手机外部扫码使用的下载二维码。'
  }
  return '正在生成下载二维码...'
})

async function refreshSettings(showSuccess = false) {
  refreshing.value = true
  try {
    const [{ data: clientConfig }, { data: releaseData }] = await Promise.all([getClientConfig(), getAppReleases()])

    publicBaseUrl.value = clientConfig?.publicBaseUrl || ''
    manualPublicBaseUrlInput.value = clientConfig?.manualPublicBaseUrl || ''
    appLinkUrl.value = clientConfig?.appLinkUrl || ''
    appDownloadUrl.value = clientConfig?.appDownloadUrl || ''
    releaseMode.value = releaseData?.mode === 'uploaded' ? 'uploaded' : 'legacy'
    appReleases.value = Array.isArray(releaseData?.items) ? releaseData.items : []

    await Promise.all([
      updateQrCode(publicBaseUrl.value, serverConfigQrCodeDataUrl),
      updateQrCode(
        publicBaseUrl.value && currentReleaseDownloadPageUrl.value.startsWith('http')
          ? currentReleaseDownloadPageUrl.value
          : '',
        releaseQrCodeDataUrl,
      ),
    ])

    lastRefreshAt.value = new Date().toISOString()

    if (showSuccess) {
      ElMessage.success('设置已刷新')
    }
  } catch (error) {
    publicBaseUrl.value = ''
    appLinkUrl.value = ''
    appDownloadUrl.value = ''
    appReleases.value = []
    releaseMode.value = 'legacy'
    serverConfigQrCodeDataUrl.value = ''
    releaseQrCodeDataUrl.value = ''
    lastRefreshAt.value = ''

    if (showSuccess) {
      ElMessage.error(extractErrorMessage(error, '设置刷新失败，请稍后重试'))
    }
  } finally {
    refreshing.value = false
  }
}

async function saveManualPublicBaseUrl() {
  savingManualUrl.value = true
  try {
    await setPublicBaseUrl(manualPublicBaseUrlInput.value)
    await refreshSettings()
    ElMessage.success('服务地址已保存')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '保存失败'))
  } finally {
    savingManualUrl.value = false
  }
}

async function clearManualPublicBaseUrl() {
  manualPublicBaseUrlInput.value = ''
  await saveManualPublicBaseUrl()
}

function formatApkUpdatedAt(value: string) {
  if (!value) return '未检测到版本'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRefreshTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatFileSize(sizeBytes: number) {
  const size = Number(sizeBytes || 0)
  if (!Number.isFinite(size) || size <= 0) {
    return ''
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${Math.round(size)} B`
}

function formatReleaseSource(source: AppReleaseItem['source']) {
  return source === 'uploaded' ? '后台上传' : '目录兼容'
}

function preventAutoUpload() {
  return false
}

function handleReleaseFileChange(uploadFile: UploadFile) {
  const rawFile = uploadFile.raw as UploadRawFile | undefined
  selectedReleaseZipFile.value = rawFile ? (rawFile as unknown as File) : null
  selectedReleaseZipName.value = rawFile?.name || ''
}

function clearSelectedReleaseFile() {
  selectedReleaseZipFile.value = null
  selectedReleaseZipName.value = ''
}

async function submitReleaseUpload() {
  if (!selectedReleaseZipFile.value) {
    ElMessage.warning('请先选择 ZIP 更新包')
    return
  }

  uploadingRelease.value = true
  try {
    await uploadAppRelease(selectedReleaseZipFile.value)
    clearSelectedReleaseFile()
    await refreshSettings()
    ElMessage.success('移动端更新包已上传并生效')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '上传失败，请检查 ZIP 内容'))
  } finally {
    uploadingRelease.value = false
  }
}

async function setCurrentRelease(release: AppReleaseItem) {
  if (release.isCurrent || activatingReleaseId.value) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `将 ${release.versionName || release.fileName} 设为当前分发版本后，移动端登录和启动时会按这个版本提示更新。`,
      '切换当前版本',
      {
        confirmButtonText: '继续切换',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  activatingReleaseId.value = release.id
  try {
    await activateAppRelease(release.id)
    await refreshSettings()
    ElMessage.success('当前分发版本已切换')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '切换失败，请稍后重试'))
  } finally {
    activatingReleaseId.value = ''
  }
}

async function removeRelease(release: AppReleaseItem) {
  if (release.isCurrent || release.source !== 'uploaded' || deletingReleaseId.value) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `删除 ${release.versionName || release.fileName} 后，这个版本会从后台版本库中移除，已复制出去的历史下载链接也会失效。`,
      '删除移动端版本',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  deletingReleaseId.value = release.id
  try {
    await deleteAppRelease(release.id)
    await refreshSettings()
    ElMessage.success('移动端版本已删除')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '删除失败，请稍后重试'))
  } finally {
    deletingReleaseId.value = ''
  }
}

async function updateQrCode(value: string, target: { value: string }) {
  if (!value) {
    target.value = ''
    return
  }

  try {
    target.value = await QRCode.toDataURL(value, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffffff',
      },
    })
  } catch {
    target.value = ''
  }
}

async function copyPublicUrl() {
  if (!publicBaseUrl.value) return
  try {
    await navigator.clipboard.writeText(publicBaseUrl.value)
    ElMessage.success('地址已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function copyApkUrl() {
  if (!currentReleaseDownloadUrl.value) return
  try {
    await navigator.clipboard.writeText(currentReleaseDownloadUrl.value)
    ElMessage.success('下载链接已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function copyReleaseDownloadUrl(release: AppReleaseItem) {
  if (!release.downloadUrl) return
  try {
    await navigator.clipboard.writeText(release.downloadUrl)
    ElMessage.success('下载链接已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function openAppLinkPage() {
  if (!appLinkUrl.value) return
  window.open(appLinkUrl.value, '_blank', 'noopener,noreferrer')
}

function openCurrentReleasePage() {
  if (!currentReleaseDownloadPageUrl.value) return
  window.open(currentReleaseDownloadPageUrl.value, '_blank', 'noopener,noreferrer')
}

function openReleasePage(release: AppReleaseItem) {
  if (!release.downloadPageUrl) return
  window.open(release.downloadPageUrl, '_blank', 'noopener,noreferrer')
}

function downloadDataUrlAsFile(dataUrl: string, fileName: string) {
  if (!dataUrl) return
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}

function installUpdatePackage() {
  if (!window.chrome?.webview) {
    ElMessage.warning('请在桌面程序内安装更新包')
    return
  }
  installingUpdate.value = true
  updateMessage.value = '请选择更新包...'
  window.chrome.webview.postMessage({ type: 'install-update-package' })
}

function handleWebViewMessage(event: MessageEvent) {
  const data = event.data as WebViewMessage
  if (data?.type !== 'install-update-package-result') {
    return
  }

  installingUpdate.value = false
  updateMessage.value = data.message || ''
  if (data.cancelled) {
    return
  }
  if (data.success) {
    ElMessage.success(data.message || '更新安装完成')
    window.setTimeout(() => window.location.reload(), 1200)
    return
  }
  if (data.message) {
    ElMessage.error(data.message)
  }
}

function handleVisibilityChange() {
  if (!document.hidden) {
    refreshSettings()
  }
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const responseMessage = (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
    if (Array.isArray(responseMessage)) {
      const text = responseMessage.map((item) => String(item || '').trim()).filter(Boolean).join('，')
      if (text) return text
    }
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage.trim()
    }

    const message = (error as { message?: string }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return fallback
}

onMounted(async () => {
  desktopUpdateSupported.value = !!window.chrome?.webview
  window.chrome?.webview?.addEventListener('message', handleWebViewMessage)
  await refreshSettings()
  refreshTimer = setInterval(() => {
    refreshSettings()
  }, 15000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  window.chrome?.webview?.removeEventListener('message', handleWebViewMessage)
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.settings-view {
  display: grid;
  gap: 18px;
}

.settings-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.7fr);
  gap: 20px;
  align-items: center;
}

.hero-eyebrow {
  font-size: 12px;
  color: #64748b;
}

.hero-copy h2 {
  margin: 8px 0 0;
  font-size: 28px;
  color: #0f172a;
}

.hero-copy p {
  margin: 12px 0 0;
  color: #475569;
  line-height: 1.7;
}

.hero-meta {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #334155;
  line-height: 1.6;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
}

.hero-actions {
  display: grid;
  gap: 10px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.settings-section {
  display: grid;
  gap: 16px;
}

.release-section {
  gap: 18px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.section-header p {
  margin: 8px 0 0;
  color: #475569;
  line-height: 1.6;
}

.update-layout,
.form-block,
.qr-actions {
  display: grid;
  gap: 12px;
}

.status-list {
  display: grid;
  gap: 10px;
}

.status-row {
  display: grid;
  gap: 6px;
}

.info-label {
  font-size: 12px;
  color: #64748b;
}

.info-value,
.helper-text {
  color: #334155;
  line-height: 1.6;
  word-break: break-word;
}

.info-block,
.qr-empty {
  padding: 14px;
  border-radius: 8px;
  background: #f8fafc;
  line-height: 1.6;
  color: #0f172a;
  word-break: break-all;
}

.input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.qr-layout {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.qr-card {
  display: grid;
  place-items: center;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.qr-image {
  width: 220px;
  height: 220px;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  box-sizing: border-box;
}

.qr-empty {
  min-height: 244px;
  display: grid;
  place-items: center;
  text-align: center;
}

.apk-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-item {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 8px;
  background: #f8fafc;
}

.summary-item strong {
  font-size: 18px;
  line-height: 1.5;
  color: #0f172a;
  word-break: break-word;
}

.release-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) auto;
  gap: 16px;
  align-items: start;
}

.release-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.upload-copy {
  display: grid;
  gap: 10px;
}

.helper-banner {
  padding: 14px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e3a8a;
  line-height: 1.6;
}

.release-list {
  display: grid;
  gap: 14px;
}

.release-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 18px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.release-item-active {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.release-main {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.release-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.release-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  word-break: break-word;
}

.release-subtitle {
  margin-top: 6px;
  color: #64748b;
  line-height: 1.5;
  word-break: break-all;
}

.release-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.release-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.release-badge-active {
  background: #dcfce7;
  color: #166534;
}

.release-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.release-meta-item {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.release-meta-item strong {
  color: #0f172a;
  line-height: 1.5;
  word-break: break-word;
}

.release-notes {
  padding: 14px;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.release-notes-muted {
  color: #64748b;
}

.release-actions {
  display: grid;
  gap: 10px;
  align-content: start;
}

.ghost-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
}

.ghost-link:disabled {
  color: #94a3b8;
  cursor: default;
}

@media (max-width: 1280px) {
  .settings-hero,
  .settings-grid,
  .release-toolbar,
  .release-item {
    grid-template-columns: 1fr;
  }

  .release-toolbar-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 900px) {
  .input-row,
  .qr-layout,
  .apk-summary,
  .release-meta-grid {
    grid-template-columns: 1fr;
  }

  .release-head {
    flex-direction: column;
  }

  .release-badges {
    justify-content: flex-start;
  }
}
</style>
