<template>
  <view class="page">
    <view class="card">
      <view class="title">服务器配置</view>

      <template v-if="supportsServerConfig">
        <view class="subtitle">
          可以手动填写，也可以扫码或从本地图片识别后台二维码，把服务器地址写入 App。
        </view>

        <view class="field">
          <view class="field-label">服务器地址</view>
          <textarea
            v-model="serverBaseUrl"
            class="textarea"
            auto-height
            maxlength="-1"
            placeholder="例如 https://your-cpolar-domain.cpolar.top"
          />
        </view>

        <view class="helper">
          <view>默认地址：{{ defaultBaseUrl }}</view>
          <view>当前生效：{{ currentBaseUrl }}</view>
        </view>

        <view class="actions actions-top">
          <button class="scan-button" @click="scanAndSave">扫码配置服务器</button>
          <button class="ghost-button" @click="scanImageAndSave">从相册识别二维码</button>
        </view>

        <view class="actions">
          <button class="ghost-button" @click="resetDefault">恢复默认</button>
          <button class="primary-button" @click="save">保存并返回</button>
        </view>
      </template>

      <template v-else>
        <view class="subtitle">
          微信小程序使用固定的服务器地址，不能在客户端动态切换。
        </view>
        <view class="helper">
          <view>当前服务器：{{ currentBaseUrl }}</view>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import {
  extractBaseUrlFromScanResult,
  getDefaultBaseUrl,
  getServerBaseUrl,
  setServerBaseUrl,
  supportsDynamicServerConfig,
} from '../../utils/config'
import { scanAndApplyServerConfig, scanImageAndApplyServerConfig } from '../../utils/scan'

export default {
  data() {
    return {
      serverBaseUrl: '',
      defaultBaseUrl: getDefaultBaseUrl(),
      currentBaseUrl: '',
      supportsServerConfig: supportsDynamicServerConfig(),
    }
  },
  onShow() {
    const current = getServerBaseUrl()
    this.serverBaseUrl = current
    this.currentBaseUrl = current
  },
  methods: {
    resetDefault() {
      this.serverBaseUrl = this.defaultBaseUrl
    },
    applyBaseUrl(baseUrl, navigateBack) {
      const normalized = extractBaseUrlFromScanResult(baseUrl)

      if (!normalized) {
        uni.showToast({ title: '请输入正确的 http 或 https 地址', icon: 'none' })
        return false
      }

      setServerBaseUrl(normalized)
      this.serverBaseUrl = normalized
      this.currentBaseUrl = normalized
      uni.showToast({ title: '地址写入成功', icon: 'success' })

      if (navigateBack) {
        setTimeout(() => {
          uni.navigateBack()
        }, 500)
      }

      return true
    },
    save() {
      if (!this.supportsServerConfig) {
        uni.navigateBack()
        return
      }
      this.applyBaseUrl(this.serverBaseUrl, true)
    },
    async scanAndSave() {
      if (!this.supportsServerConfig) {
        return
      }

      const result = await scanAndApplyServerConfig({
        onApplied: (baseUrl) => {
          this.serverBaseUrl = baseUrl
          this.currentBaseUrl = baseUrl
        },
      })

      if (result.ok) {
        setTimeout(() => {
          uni.navigateBack()
        }, 500)
      }
    },
    async scanImageAndSave() {
      if (!this.supportsServerConfig) {
        return
      }

      const result = await scanImageAndApplyServerConfig({
        onApplied: (baseUrl) => {
          this.serverBaseUrl = baseUrl
          this.currentBaseUrl = baseUrl
        },
      })

      if (result.ok) {
        setTimeout(() => {
          uni.navigateBack()
        }, 500)
      }
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
  padding: 30rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}

.title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
}

.subtitle {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--text-sub);
}

.field {
  margin-top: 28rpx;
}

.field-label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: var(--text-sub);
}

.textarea {
  width: 100%;
  min-height: 180rpx;
  padding: 22rpx 24rpx;
  box-sizing: border-box;
  border: 2rpx solid #dbe3ef;
  border-radius: 18rpx;
  background: #f8fafc;
  font-size: 28rpx;
  color: var(--text-main);
  line-height: 1.6;
}

.helper {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--text-muted);
  word-break: break-all;
}

.actions {
  margin-top: 18rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.actions-top {
  margin-top: 30rpx;
  grid-template-columns: 1fr;
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
