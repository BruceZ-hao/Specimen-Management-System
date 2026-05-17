<template>
  <view class="page">
    <view class="hero">
      <view class="hero-badge">JNRon</view>
      <view class="hero-title">样品管理系统</view>
      <view class="hero-subtitle">
        操作员负责执行工序，检测员负责上传对应工序的检测报告，管理员统一维护项目和路径配置。
      </view>
    </view>

    <view class="card">
      <view class="section-title">账号登录</view>

      <view class="server-banner">
        <view class="server-label">当前服务器</view>
        <view class="server-value">{{ serverBaseUrl }}</view>
        <view class="server-actions">
          <button v-if="supportsServerConfig" class="server-button" @click="openServerSettings">服务器配置</button>
          <button v-if="supportsAppUpdate" class="server-secondary-button" @click="openAppUpdate">应用更新</button>
        </view>
      </view>

      <view class="field">
        <view class="field-label">账号</view>
        <input v-model="form.username" class="input" placeholder="请输入账号" />
      </view>
      <view class="field">
        <view class="field-label">密码</view>
        <input v-model="form.password" class="input" password placeholder="请输入密码" />
      </view>
      <button class="button" :disabled="submitting" @click="submit">
        {{ submitting ? '登录中...' : '进入工作台' }}
      </button>
    </view>
  </view>
</template>

<script>
import { setSession } from '../../utils/auth'
import { maybePromptForAppUpdate, openAppUpdatePage, supportsNativeAppUpdate } from '../../utils/app-update'
import { getServerBaseUrl, supportsDynamicServerConfig } from '../../utils/config'
import { formatConnectivityErrorMessage, isConnectivityError, request } from '../../utils/request'

function extractErrorMessage(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
    if (typeof error.errMsg === 'string' && error.errMsg.trim()) {
      return error.errMsg
    }
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return '登录失败，请检查服务器地址或账号密码。'
}

export default {
  data() {
    return {
      form: {
        username: '',
        password: '',
      },
      submitting: false,
      serverBaseUrl: '',
      supportsServerConfig: supportsDynamicServerConfig(),
      supportsAppUpdate: supportsNativeAppUpdate(),
    }
  },
  onShow() {
    this.serverBaseUrl = getServerBaseUrl()
  },
  methods: {
    async openAppUpdate() {
      if (!this.supportsAppUpdate) {
        return
      }
      await openAppUpdatePage()
    },
    openServerSettings() {
      if (!this.supportsServerConfig) {
        return
      }
      uni.navigateTo({ url: '/pages/server-settings/index' })
    },
    showConnectivityHelp(error) {
      const content = formatConnectivityErrorMessage(error)

      if (!this.supportsServerConfig) {
        uni.showModal({
          title: '连接失败',
          content,
          showCancel: false,
        })
        return
      }

      uni.showModal({
        title: '连接失败',
        content,
        confirmText: '服务器配置',
        cancelText: '关闭',
        success: ({ confirm }) => {
          if (confirm) {
            this.openServerSettings()
          }
        },
      })
    },
    async submit() {
      if (this.submitting) {
        return
      }

      this.submitting = true

      try {
        const data = await request({
          url: '/auth/login',
          method: 'POST',
          data: this.form,
        })

        setSession(data.accessToken, data.user)

        const updateResult = await maybePromptForAppUpdate()
        if (updateResult?.action === 'download' && updateResult.updatePageUrl) {
          uni.reLaunch({ url: updateResult.updatePageUrl })
          return
        }

        uni.reLaunch({ url: '/pages/tasks/index' })
      } catch (error) {
        if (isConnectivityError(error)) {
          this.showConnectivityHelp(error)
          return
        }

        uni.showToast({
          title: String(extractErrorMessage(error)).slice(0, 30),
          icon: 'none',
        })
      } finally {
        this.submitting = false
      }
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 72rpx 32rpx 32rpx;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 32%, #eef2f7 32%, #eef2f7 100%);
}

.hero {
  margin-bottom: 36rpx;
  color: #fff;
}

.hero-badge {
  display: inline-block;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.12);
  font-size: 22rpx;
}

.hero-title {
  margin-top: 20rpx;
  font-size: 52rpx;
  font-weight: 700;
}

.hero-subtitle {
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.78);
  font-size: 24rpx;
  line-height: 1.6;
}

.card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 32rpx;
  box-shadow: 0 18rpx 48rpx rgba(15, 23, 42, 0.12);
}

.section-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #111827;
}

.server-banner {
  margin-top: 24rpx;
  margin-bottom: 24rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background: #eff6ff;
}

.server-label,
.field-label {
  font-size: 22rpx;
  color: #64748b;
}

.server-value {
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #1e3a8a;
  word-break: break-all;
}

.server-actions {
  display: flex;
  gap: 14rpx;
  margin-top: 18rpx;
}

.server-button,
.server-secondary-button {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  font-weight: 700;
}

.server-button {
  background: #dbeafe;
  color: #1d4ed8;
}

.server-secondary-button {
  background: #e2e8f0;
  color: #334155;
}

.field {
  margin-bottom: 24rpx;
}

.input {
  height: 92rpx;
  border: 2rpx solid #dbe3ef;
  border-radius: 18rpx;
  padding: 0 24rpx;
  background: #f8fafc;
  font-size: 28rpx;
}

.button {
  margin-top: 10rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
}

.button[disabled] {
  opacity: 0.7;
}
</style>
