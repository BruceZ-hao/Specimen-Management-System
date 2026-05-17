<template>
  <view class="page">
    <view class="card hero-card">
      <view class="eyebrow">Android 更新</view>
      <view class="title">应用更新</view>
      <view class="subtitle">
        可以直接检查当前服务器分发的安装包，也可以扫描后台生成的下载二维码，读取指定版本后立即下载并安装。
      </view>
    </view>

    <view class="card">
      <view class="section-title">当前状态</view>
      <view class="status-banner" :class="statusClass">{{ statusText }}</view>
      <view v-if="errorMessage" class="error-text">{{ errorMessage }}</view>
      <view v-if="lastCheckedAt" class="meta-line">最近检查：{{ lastCheckedAtText }}</view>
      <view class="meta-line">当前来源：{{ remoteSourceText }}</view>
    </view>

    <view class="card">
      <view class="section-title">本机版本</view>
      <view class="info-row">
        <text class="info-label">版本号</text>
        <text class="info-value">{{ localVersionText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">版本代码</text>
        <text class="info-value">{{ localVersionCodeText }}</text>
      </view>
    </view>

    <view class="card">
      <view class="section-title">服务端安装包</view>
      <view class="info-row">
        <text class="info-label">文件名</text>
        <text class="info-value value-wrap">{{ remoteFileNameText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">版本号</text>
        <text class="info-value">{{ remoteVersionText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">版本代码</text>
        <text class="info-value">{{ remoteVersionCodeText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">包大小</text>
        <text class="info-value">{{ remoteFileSizeText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">更新时间</text>
        <text class="info-value">{{ remoteUpdatedAtText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">来源地址</text>
        <text class="info-value value-wrap">{{ remoteBaseUrlText }}</text>
      </view>
      <view v-if="remoteReleaseNotes" class="notes-block">
        <view class="notes-title">更新说明</view>
        <view class="notes-content">{{ remoteReleaseNotes }}</view>
      </view>
    </view>

    <view v-if="supportsUpdate" class="card">
      <view class="section-title">扫码下载</view>
      <view class="hint-text">
        直接扫描后台“当前版本下载二维码”或历史版本下载二维码，识别后会把该版本加载到当前页面。
      </view>
      <view class="scan-button-group">
        <button class="scan-button" :disabled="loading || downloading" @click="scanUpdateCode">
          扫描更新二维码
        </button>
        <button class="ghost-button" :disabled="loading || downloading" @click="scanUpdateCodeFromImage">
          从相册识别二维码
        </button>
      </view>
    </view>

    <view class="card">
      <view class="section-title">操作</view>
      <view v-if="downloading" class="progress-panel">
        <view class="progress-copy">
          <text>下载中</text>
          <text>{{ downloadProgressText }}</text>
        </view>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: progressWidthStyle }"></view>
        </view>
      </view>
      <view class="button-group">
        <button class="ghost-button" :disabled="loading || downloading" @click="refreshInfo(true)">
          {{ loading ? '检查中...' : '检查当前版本' }}
        </button>
        <button class="primary-button" :disabled="loading || downloading || !canInstall" @click="installUpdate()">
          {{ installButtonText }}
        </button>
      </view>
      <view class="hint-text">
        安装时会弹出系统安装界面；如果系统拦截未知来源安装，请按提示允许当前应用继续安装。
      </view>
    </view>
  </view>
</template>

<script>
import {
  downloadLatestApk,
  formatAppUpdateError,
  formatDateTime,
  formatFileSize,
  getLocalAppInfo,
  getRemoteAppInfo,
  installDownloadedApk,
  resolveScannedRemoteAppInfo,
  resolveUpdateState,
  supportsNativeAppUpdate,
} from '../../utils/app-update'
import { scanQrCodeText, scanQrImageText } from '../../utils/scan'

function buildDefaultState() {
  return {
    key: 'unsupported',
    text: '仅支持 Android App 内更新',
    canInstall: false,
    recommendInstall: false,
  }
}

function showStateToast(key) {
  if (key === 'update-available') {
    uni.showToast({ title: '发现新版本', icon: 'none' })
    return
  }

  if (key === 'up-to-date') {
    uni.showToast({ title: '已经是最新版本', icon: 'none' })
    return
  }

  uni.showToast({ title: '更新信息已刷新', icon: 'none' })
}

function confirmInstall(content) {
  return new Promise((resolve) => {
    uni.showModal({
      title: '确认安装',
      content,
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })
}

export default {
  data() {
    return {
      supportsUpdate: supportsNativeAppUpdate(),
      loading: false,
      downloading: false,
      downloadProgress: 0,
      lastCheckedAt: '',
      errorMessage: '',
      localInfo: {
        versionName: '',
        versionCode: '',
      },
      remoteInfo: {
        baseUrl: '',
        fileName: '',
        versionName: '',
        versionCode: '',
        updatedAt: '',
        sizeBytes: 0,
        downloadUrl: '',
        releaseNotes: '',
      },
      updateState: buildDefaultState(),
      autoStart: false,
      autoStartConsumed: false,
      skipNextOnShowRefresh: false,
      remoteSourceMode: 'server',
    }
  },
  computed: {
    statusText() {
      const stateMap = {
        unsupported: '仅支持 Android App 内更新',
        'missing-package': '服务端当前没有可安装的 APK',
        'update-available': '发现可安装的新版本',
        'reinstall-available': '服务端已有安装包，可重新安装覆盖',
        'up-to-date': '当前已经是服务端选中的版本',
        'local-newer': '当前手机上的版本比服务端选中的安装包更新',
      }

      return stateMap[this.updateState.key] || this.updateState.text || '尚未检查更新'
    },
    statusClass() {
      const classMap = {
        unsupported: 'status-neutral',
        'missing-package': 'status-neutral',
        'update-available': 'status-primary',
        'reinstall-available': 'status-primary',
        'up-to-date': 'status-success',
        'local-newer': 'status-warning',
      }

      return classMap[this.updateState.key] || 'status-neutral'
    },
    canInstall() {
      return Boolean(this.supportsUpdate && this.updateState.canInstall && this.remoteInfo.downloadUrl)
    },
    installButtonText() {
      if (this.downloading) {
        return `下载中 ${this.downloadProgressText}`
      }

      if (!this.canInstall) {
        return '暂无可安装包'
      }

      if (this.updateState.key === 'update-available') {
        return '下载并安装新版本'
      }

      if (this.updateState.key === 'up-to-date') {
        return '重新安装当前版本'
      }

      return '下载并安装'
    },
    downloadProgressText() {
      return `${Math.max(0, Math.min(100, Math.round(this.downloadProgress || 0)))}%`
    },
    progressWidthStyle() {
      return `${Math.max(0, Math.min(100, Math.round(this.downloadProgress || 0)))}%`
    },
    localVersionText() {
      return this.localInfo.versionName || '-'
    },
    localVersionCodeText() {
      return this.localInfo.versionCode || '-'
    },
    remoteFileNameText() {
      return this.remoteInfo.fileName || '-'
    },
    remoteVersionText() {
      return this.remoteInfo.versionName || '-'
    },
    remoteVersionCodeText() {
      return this.remoteInfo.versionCode || '-'
    },
    remoteFileSizeText() {
      return formatFileSize(this.remoteInfo.sizeBytes) || '-'
    },
    remoteUpdatedAtText() {
      return formatDateTime(this.remoteInfo.updatedAt) || '-'
    },
    remoteBaseUrlText() {
      return this.remoteInfo.baseUrl || '-'
    },
    lastCheckedAtText() {
      return formatDateTime(this.lastCheckedAt) || '-'
    },
    remoteReleaseNotes() {
      return this.remoteInfo.releaseNotes || ''
    },
    remoteSourceText() {
      return this.remoteSourceMode === 'scan' ? '扫码指定版本' : '当前服务器分发版本'
    },
  },
  onLoad(options) {
    this.autoStart = String(options?.autoStart || '') === '1'
    this.skipNextOnShowRefresh = true
    this.handlePageEntry()
  },
  onShow() {
    if (this.skipNextOnShowRefresh) {
      this.skipNextOnShowRefresh = false
      return
    }

    this.refreshInfo()
  },
  methods: {
    async handlePageEntry() {
      await this.refreshInfo()
      await this.maybeAutoStartInstall()
    },
    async ensureLocalInfoLoaded() {
      if (this.localInfo.versionName || this.localInfo.versionCode) {
        return this.localInfo
      }

      const localInfo = await getLocalAppInfo()
      this.localInfo = localInfo
      return localInfo
    },
    async refreshInfo(showToast = false) {
      this.loading = true
      this.errorMessage = ''

      try {
        const [localInfo, remoteInfo] = await Promise.all([getLocalAppInfo(), getRemoteAppInfo()])
        this.localInfo = localInfo
        this.remoteInfo = remoteInfo
        this.updateState = resolveUpdateState(localInfo, remoteInfo)
        this.lastCheckedAt = new Date().toISOString()
        this.remoteSourceMode = 'server'

        if (showToast) {
          showStateToast(this.updateState.key)
        }
      } catch (error) {
        this.errorMessage = formatAppUpdateError(error)
        this.updateState = buildDefaultState()
        if (showToast) {
          uni.showToast({ title: '检查更新失败', icon: 'none' })
        }
      } finally {
        this.loading = false
      }
    },
    async maybeAutoStartInstall() {
      if (!this.autoStart || this.autoStartConsumed || !this.canInstall) {
        return
      }

      this.autoStartConsumed = true
      await this.installUpdate({ skipConfirm: true })
    },
    buildInstallPromptText() {
      const versionLabel = this.remoteInfo.versionName
        ? `v${this.remoteInfo.versionName}`
        : this.remoteInfo.fileName || '该安装包'

      if (this.updateState.key === 'update-available') {
        return `即将下载 ${versionLabel} 并调起系统安装。`
      }

      if (this.updateState.key === 'up-to-date') {
        return `当前设备已经是 ${versionLabel}，是否仍重新安装？`
      }

      if (this.updateState.key === 'local-newer') {
        return `当前设备版本更新，是否仍下载 ${versionLabel} 并安装？`
      }

      return `即将下载 ${versionLabel} 并调起系统安装。`
    },
    async installUpdate(options = {}) {
      if (!this.canInstall) {
        uni.showToast({ title: '当前没有可安装的更新包', icon: 'none' })
        return
      }

      const skipConfirm = Boolean(options.skipConfirm)
      if (!skipConfirm) {
        const confirmed = await confirmInstall(this.buildInstallPromptText())
        if (!confirmed) {
          return
        }
      }

      this.downloading = true
      this.downloadProgress = 0
      this.errorMessage = ''

      try {
        const filePath = await downloadLatestApk(this.remoteInfo.downloadUrl, (progressEvent) => {
          this.downloadProgress = Number(progressEvent?.progress || 0)
        })

        await installDownloadedApk(filePath)
        uni.showToast({ title: '已打开系统安装界面', icon: 'none' })
      } catch (error) {
        this.errorMessage = formatAppUpdateError(error)
        uni.showToast({ title: '安装更新失败', icon: 'none' })
      } finally {
        this.downloading = false
      }
    },
    async scanUpdateCode() {
      await this.loadRemoteInfoFromScan(scanQrCodeText)
    },
    async scanUpdateCodeFromImage() {
      await this.loadRemoteInfoFromScan(scanQrImageText)
    },
    async loadRemoteInfoFromScan(scanLoader) {
      if (!this.supportsUpdate || this.loading || this.downloading) {
        return
      }

      const scanResult = await scanLoader()
      if (!scanResult.ok) {
        if (scanResult.reason === 'image-scan-not-supported') {
          uni.showToast({ title: '当前平台不支持图片识码', icon: 'none' })
          return
        }

        if (
          scanResult.reason !== 'cancelled' &&
          scanResult.reason !== 'permission-denied' &&
          scanResult.reason !== 'choose-image-failed'
        ) {
          uni.showToast({ title: '扫码失败，请重试', icon: 'none' })
        }
        return
      }

      this.loading = true
      this.errorMessage = ''

      try {
        await this.ensureLocalInfoLoaded()
        const result = await resolveScannedRemoteAppInfo(scanResult.text)
        this.remoteInfo = result.remoteInfo
        this.updateState = resolveUpdateState(this.localInfo, result.remoteInfo)
        this.lastCheckedAt = new Date().toISOString()
        this.remoteSourceMode = 'scan'
      } catch (error) {
        this.errorMessage = formatAppUpdateError(error)
        uni.showToast({ title: '读取二维码失败', icon: 'none' })
        return
      } finally {
        this.loading = false
      }

      if (!this.canInstall) {
        uni.showToast({ title: '二维码已识别，但当前没有可安装包', icon: 'none' })
        return
      }

      const confirmed = await confirmInstall(this.buildInstallPromptText())
      if (!confirmed) {
        uni.showToast({ title: '已读取扫码版本', icon: 'none' })
        return
      }

      await this.installUpdate({ skipConfirm: true })
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: var(--bg-page);
}

.card {
  margin-bottom: 18rpx;
  padding: 28rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}

.hero-card {
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
}

.eyebrow {
  font-size: 22rpx;
  color: var(--primary-dark);
}

.title {
  margin-top: 10rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--text-main);
}

.subtitle {
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--text-sub);
}

.section-title {
  margin-bottom: 16rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-main);
}

.status-banner {
  padding: 22rpx 24rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  font-weight: 600;
}

.status-neutral {
  background: #e2e8f0;
  color: #334155;
}

.status-primary {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-success {
  background: #dcfce7;
  color: #166534;
}

.status-warning {
  background: #fef3c7;
  color: #92400e;
}

.error-text,
.meta-line,
.hint-text {
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.7;
}

.error-text {
  color: #dc2626;
}

.meta-line,
.hint-text {
  color: var(--text-sub);
}

.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--border-light);
}

.info-row:last-of-type {
  border-bottom: none;
}

.info-label {
  font-size: 24rpx;
  color: var(--text-sub);
}

.info-value {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-main);
}

.value-wrap {
  word-break: break-all;
}

.notes-block {
  margin-top: 10rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid var(--border-light);
}

.notes-title {
  font-size: 24rpx;
  color: var(--text-sub);
}

.notes-content {
  margin-top: 10rpx;
  white-space: pre-wrap;
  font-size: 25rpx;
  line-height: 1.7;
  color: var(--text-main);
}

.progress-panel {
  margin-bottom: 18rpx;
  padding: 20rpx;
  border-radius: 18rpx;
  background: var(--bg-soft);
}

.progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: var(--text-main);
}

.progress-track {
  width: 100%;
  height: 14rpx;
  border-radius: 999rpx;
  background: #dbe3ef;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
}

.button-group,
.scan-button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.scan-button,
.ghost-button,
.primary-button {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 18rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.scan-button {
  background: #0f172a;
  color: #ffffff;
}

.ghost-button {
  background: #e2e8f0;
  color: #334155;
}

.primary-button {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
}
</style>
