<template>
  <section class="dashboard">
    <div class="page-card hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">桌面端首页</div>
        <h1>当前 APK 与移动端访问状态</h1>
        <p>
          这里集中展示当前对外分发的 APK、移动端访问地址和扫码配网入口。后台切换 APK
          后，移动端自动更新提醒会按这里的生效包来检查。
        </p>
        <div class="auto-refresh-tip">
          <span class="auto-refresh-badge">自动刷新已开启</span>
          <span>
            {{
              lastRefreshAt
                ? `最近一次自动刷新时间：${formatRefreshTime(lastRefreshAt)}`
                : '正在自动刷新 cpolar 和 APK 状态...'
            }}
          </span>
        </div>
      </div>
      <div class="hero-actions">
        <el-button type="primary" :disabled="!appDownloadUrl" @click="openApkUrl">打开 APK 下载链接</el-button>
        <el-button :loading="refreshing" @click="refreshDashboard(true)">
          {{ refreshing ? '刷新中...' : '立即刷新状态' }}
        </el-button>
        <el-button :disabled="!publicBaseUrl" @click="copyPublicUrl">复制移动端地址</el-button>
        <el-button :disabled="!appLinkUrl" @click="openAppLinkPage">打开配网页</el-button>
      </div>
    </div>

    <div class="page-card manual-url-card">
      <div class="card-title-row">
        <h2>手动填写服务地址</h2>
      </div>
      <div class="manual-url-copy">
        自动检测不到公网地址时，把 `https://...cpolar.top` 填到这里保存。移动端首页、更新页和扫码配网都会优先使用这个地址。
      </div>
      <div class="manual-url-form">
        <el-input
          v-model="manualPublicBaseUrlInput"
          placeholder="例如：https://2270e4.r27.cpolar.top"
          clearable
        />
        <el-button :loading="savingManualUrl" type="primary" @click="saveManualPublicBaseUrl">
          保存地址
        </el-button>
        <el-button :disabled="!manualPublicBaseUrlInput" @click="clearManualPublicBaseUrl">清空</el-button>
      </div>
      <div class="manual-url-current">
        当前手动地址：{{ manualPublicBaseUrl || '未设置，默认优先自动检测 cpolar' }}
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="page-card summary-card summary-card-primary">
        <div class="summary-label">当前生效 APK</div>
        <div class="summary-value">{{ currentApkName || '未检测到 APK 文件' }}</div>
        <div class="summary-meta">更新时间：{{ formatApkUpdatedAt(apkUpdatedAt) }}</div>
        <div class="summary-status">
          <span class="status-pill status-completed">{{ currentApkName ? '当前生效' : '未生效' }}</span>
        </div>
      </div>

      <div class="page-card summary-card">
        <div class="summary-label">移动端当前地址</div>
        <div class="summary-value compact">{{ publicBaseUrl || emptyText }}</div>
        <div class="summary-meta">cpolar 地址变化后，这里会自动刷新，也可以手动覆盖。</div>
      </div>

      <div class="page-card summary-card">
        <div class="summary-label">APK 下载地址</div>
        <div class="summary-value compact">{{ appDownloadUrl || apkEmptyText }}</div>
        <div class="summary-actions">
          <el-button size="small" :disabled="!appDownloadUrl" @click="copyApkUrl">复制下载链接</el-button>
        </div>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid-bottom">
      <div class="page-card qr-card">
        <div class="card-title-row">
          <h2>APK 分发选择</h2>
          <el-button size="small" :disabled="!appDownloadUrl" @click="openApkUrl">打开下载链接</el-button>
        </div>
        <div class="apk-selection">
          <el-select
            v-model="apkSelectionValue"
            class="apk-select"
            :loading="apkSelectionSaving"
            placeholder="请选择当前分发的 APK"
            @change="handleApkSelectionChange"
          >
            <el-option :label="autoApkLabel" :value="AUTO_APK_VALUE" />
            <el-option
              v-for="item in apkOptions"
              :key="item.name"
              :label="formatApkOptionLabel(item)"
              :value="item.name"
            />
          </el-select>
          <div class="apk-selection-copy">
            <div>当前分发策略：{{ apkSelectionModeText }}</div>
            <div>移动端自动更新会按这里选中的 APK 检查并提醒下载。</div>
          </div>
        </div>
      </div>

      <div class="page-card qr-card">
        <div class="card-title-row">
          <h2>手机扫码配网</h2>
          <el-button size="small" :disabled="!appLinkUrl" @click="openAppLinkPage">打开配网页</el-button>
        </div>
        <div class="qr-layout">
          <template v-if="qrCodeDataUrl">
            <img class="qr-image" :src="qrCodeDataUrl" alt="Server URL QR code" />
          </template>
          <div v-else class="qr-empty">检测到地址后会自动生成二维码</div>
          <div class="qr-copy">
            <div class="qr-copy-title">扫码后会自动：</div>
            <div>1. 打开配网页</div>
            <div>2. 写入 App 服务地址</div>
            <div>3. 跳转到 App 登录页</div>
          </div>
        </div>
      </div>

      <div class="page-card quick-card">
        <div class="card-title-row">
          <h2>常用入口</h2>
        </div>
        <div class="quick-actions">
          <el-button @click="goSamples">进入项目列表</el-button>
          <el-button @click="goUsers">进入账号管理</el-button>
          <el-button :disabled="!appDownloadUrl" @click="openApkUrl">下载当前 APK</el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { useRouter } from 'vue-router'
import { getApkOptions, getClientConfig, setApkSelection, setPublicBaseUrl } from '@/api/system'

type ApkOptionItem = {
  name: string
  updatedAt: string
  isCurrent: boolean
}

const AUTO_APK_VALUE = '__AUTO_LATEST__'

const router = useRouter()
const publicBaseUrl = ref('')
const appLinkUrl = ref('')
const appDownloadUrl = ref('')
const apkUpdatedAt = ref('')
const currentApkName = ref('')
const qrCodeDataUrl = ref('')
const lastRefreshAt = ref('')
const refreshing = ref(false)
const manualPublicBaseUrl = ref('')
const manualPublicBaseUrlInput = ref('')
const savingManualUrl = ref(false)
const apkSelectionSaving = ref(false)
const apkSelectionValue = ref(AUTO_APK_VALUE)
const apkOptions = ref<ApkOptionItem[]>([])
const emptyText = '未检测到 cpolar 或 PUBLIC_BASE_URL'
const apkEmptyText = '当前没有可用的 APK 下载地址'
const autoApkLabel = '按最新时间自动选择'
let refreshTimer: ReturnType<typeof setInterval> | null = null

const apkSelectionModeText = computed(() => {
  if (apkSelectionValue.value === AUTO_APK_VALUE) {
    return '自动选择最新 APK'
  }

  return `手动指定：${apkSelectionValue.value || '未选择'}`
})

async function refreshDashboard(showSuccess = false) {
  refreshing.value = true
  try {
    const [{ data: clientConfig }, { data: apkData }] = await Promise.all([getClientConfig(), getApkOptions()])

    publicBaseUrl.value = clientConfig?.publicBaseUrl || ''
    manualPublicBaseUrl.value = clientConfig?.manualPublicBaseUrl || ''
    manualPublicBaseUrlInput.value = manualPublicBaseUrl.value
    appLinkUrl.value = clientConfig?.appLinkUrl || ''
    appDownloadUrl.value = clientConfig?.appDownloadUrl || ''
    apkUpdatedAt.value = clientConfig?.apkUpdatedAt || ''
    currentApkName.value = apkData?.currentApkName || clientConfig?.apkFileName || ''
    apkOptions.value = Array.isArray(apkData?.items) ? apkData.items : []
    apkSelectionValue.value = apkData?.selectedApkName ? apkData.selectedApkName : AUTO_APK_VALUE

    await updateQrCode(publicBaseUrl.value)
    lastRefreshAt.value = new Date().toISOString()

    if (showSuccess) {
      ElMessage.success('首页状态已刷新')
    }
  } catch {
    publicBaseUrl.value = ''
    appLinkUrl.value = ''
    appDownloadUrl.value = ''
    apkUpdatedAt.value = ''
    currentApkName.value = ''
    apkOptions.value = []
    apkSelectionValue.value = AUTO_APK_VALUE
    qrCodeDataUrl.value = ''
    lastRefreshAt.value = ''

    if (showSuccess) {
      ElMessage.error('刷新失败，请稍后再试')
    }
  } finally {
    refreshing.value = false
  }
}

async function handleApkSelectionChange(value: string) {
  const selection = value === AUTO_APK_VALUE ? '' : String(value || '').trim()
  apkSelectionSaving.value = true

  try {
    await setApkSelection(selection)
    await refreshDashboard()
    ElMessage.success(selection ? '已切换当前分发 APK' : '已切换为自动选择最新 APK')
  } catch {
    ElMessage.error('切换 APK 失败，请稍后再试')
    await refreshDashboard()
  } finally {
    apkSelectionSaving.value = false
  }
}

async function saveManualPublicBaseUrl() {
  savingManualUrl.value = true
  try {
    await setPublicBaseUrl(manualPublicBaseUrlInput.value)
    await refreshDashboard()
    ElMessage.success('手动服务地址已保存')
  } catch {
    ElMessage.error('保存手动服务地址失败')
  } finally {
    savingManualUrl.value = false
  }
}

async function clearManualPublicBaseUrl() {
  manualPublicBaseUrlInput.value = ''
  await saveManualPublicBaseUrl()
}

function formatApkUpdatedAt(value: string) {
  if (!value) return '未检测到 APK 文件'
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

function formatApkOptionLabel(item: ApkOptionItem) {
  return `${item.name} (${formatApkUpdatedAt(item.updatedAt)})`
}

async function updateQrCode(value: string) {
  if (!value) {
    qrCodeDataUrl.value = ''
    return
  }

  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(value, {
      width: 176,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffffff',
      },
    })
  } catch {
    qrCodeDataUrl.value = ''
  }
}

async function copyPublicUrl() {
  if (!publicBaseUrl.value) return
  try {
    await navigator.clipboard.writeText(publicBaseUrl.value)
    ElMessage.success('已复制移动端地址')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function copyApkUrl() {
  if (!appDownloadUrl.value) return
  try {
    await navigator.clipboard.writeText(appDownloadUrl.value)
    ElMessage.success('已复制 APK 下载链接')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function openAppLinkPage() {
  if (!appLinkUrl.value) return
  window.open(appLinkUrl.value, '_blank', 'noopener,noreferrer')
}

function openApkUrl() {
  if (!appDownloadUrl.value) return
  window.open(appDownloadUrl.value, '_blank', 'noopener,noreferrer')
}

function goSamples() {
  router.push('/samples')
}

function goUsers() {
  router.push('/users')
}

function handleVisibilityChange() {
  if (!document.hidden) {
    refreshDashboard()
  }
}

onMounted(async () => {
  await refreshDashboard()
  refreshTimer = setInterval(() => {
    refreshDashboard()
  }, 15000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 16px;
}

.manual-url-card {
  display: grid;
  gap: 12px;
}

.manual-url-copy,
.manual-url-current,
.apk-selection-copy {
  color: #475569;
  line-height: 1.6;
  word-break: break-all;
}

.manual-url-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
  gap: 20px;
  align-items: center;
}

.hero-eyebrow {
  font-size: 12px;
  color: #64748b;
}

.hero h1 {
  margin: 8px 0 0;
  font-size: 28px;
  color: #0f172a;
}

.hero p {
  margin: 12px 0 0;
  color: #475569;
  line-height: 1.7;
}

.auto-refresh-tip {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #334155;
  line-height: 1.6;
}

.auto-refresh-badge {
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

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.dashboard-grid-bottom {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(280px, 0.7fr);
}

.summary-card {
  display: grid;
  gap: 10px;
}

.summary-card-primary {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
}

.summary-label {
  font-size: 12px;
  color: #64748b;
}

.summary-value {
  font-size: 22px;
  line-height: 1.35;
  color: #0f172a;
  font-weight: 700;
  word-break: break-word;
}

.summary-value.compact {
  font-size: 15px;
  font-weight: 600;
}

.summary-meta {
  color: #475569;
  line-height: 1.6;
}

.summary-status,
.summary-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.card-title-row h2 {
  margin: 0;
  font-size: 18px;
}

.apk-selection {
  display: grid;
  gap: 14px;
}

.apk-select {
  width: 100%;
}

.qr-layout {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.qr-image {
  width: 176px;
  height: 176px;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
  box-sizing: border-box;
}

.qr-empty {
  width: 176px;
  min-height: 176px;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 16px;
}

.qr-copy {
  display: grid;
  gap: 8px;
  color: #334155;
  line-height: 1.6;
}

.qr-copy-title {
  font-weight: 700;
  color: #0f172a;
}

.quick-actions {
  display: grid;
  gap: 12px;
}

@media (max-width: 1180px) {
  .hero,
  .manual-url-form,
  .dashboard-grid,
  .dashboard-grid-bottom,
  .qr-layout {
    grid-template-columns: 1fr;
  }
}
</style>
