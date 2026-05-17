<template>
  <view class="page">
    <view class="profile-card app-card">
      <view class="profile-top">
        <view class="avatar">JN</view>
        <view class="profile-main">
          <view class="profile-name">{{ user.name || '用户' }}</view>
          <view class="profile-role">{{ roleText }}</view>
        </view>
      </view>

      <view class="profile-grid">
        <view class="profile-metric">
          <view class="profile-metric-value">{{ stats.pending }}</view>
          <view class="profile-metric-label">待处理</view>
        </view>
        <view class="profile-metric">
          <view class="profile-metric-value">{{ stats.progress }}</view>
          <view class="profile-metric-label">进行中</view>
        </view>
        <view class="profile-metric">
          <view class="profile-metric-value">{{ stats.completed }}</view>
          <view class="profile-metric-label">已完成</view>
        </view>
      </view>
    </view>

    <view class="section app-card">
      <view class="section-title">账号信息</view>
      <view class="info-row">
        <text class="info-label">账号</text>
        <text class="info-value">{{ user.username || '-' }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">角色</text>
        <text class="info-value">{{ roleText }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">服务器</text>
        <text class="info-value server-value">{{ serverBaseUrl }}</text>
      </view>
    </view>

    <view class="section app-card">
      <view class="section-title">快捷入口</view>
      <view class="action-item" @click="goTasks(defaultTaskMode)">
        <view class="action-left">
          <view class="icon-badge action-icon pending">任</view>
          <view>
            <view class="action-title">查看当前任务</view>
            <view class="action-subtitle">返回任务列表</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
      <view class="action-item" @click="goTasks(archiveMode)">
        <view class="action-left">
          <view class="icon-badge action-icon archived">档</view>
          <view>
            <view class="action-title">查看历史记录</view>
            <view class="action-subtitle">查看已完成项目或已上传报告</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
      <view v-if="supportsServerConfig" class="action-item" @click="openServerSettings">
        <view class="action-left">
          <view class="icon-badge action-icon config">配</view>
          <view>
            <view class="action-title">服务器配置</view>
            <view class="action-subtitle">修改移动端连接地址</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
      <view v-if="supportsAppUpdate" class="action-item" @click="openAppUpdate">
        <view class="action-left">
          <view class="icon-badge action-icon update">更</view>
          <view>
            <view class="action-title">应用更新</view>
            <view class="action-subtitle">检查并安装服务器当前发布的 APK</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
      <view v-if="user.role === 'admin'" class="action-item" @click="goAdminSamples">
        <view class="action-left">
          <view class="icon-badge action-icon admin">管</view>
          <view>
            <view class="action-title">管理样品</view>
            <view class="action-subtitle">新建项目、上传图纸、查看报告</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
      <view class="action-item" @click="logout">
        <view class="action-left">
          <view class="icon-badge action-icon logout">退</view>
          <view>
            <view class="action-title">退出登录</view>
            <view class="action-subtitle">返回登录页</view>
          </view>
        </view>
        <view class="action-arrow">></view>
      </view>
    </view>
  </view>
</template>

<script>
import { request } from '../../utils/request'
import { clearSession, getUser } from '../../utils/auth'
import { openAppUpdatePage, supportsNativeAppUpdate } from '../../utils/app-update'
import { getServerBaseUrl, supportsDynamicServerConfig } from '../../utils/config'

export default {
  data() {
    return {
      user: {},
      serverBaseUrl: '',
      supportsServerConfig: supportsDynamicServerConfig(),
      supportsAppUpdate: supportsNativeAppUpdate(),
      stats: {
        pending: 0,
        progress: 0,
        completed: 0,
      },
    }
  },
  computed: {
    roleText() {
      if (this.user.role === 'admin') return '管理员'
      if (this.user.role === 'inspector') return '检测员'
      if (this.user.role === 'viewer') return '只读查看'
      return '操作员'
    },
    defaultTaskMode() {
      if (this.user.role === 'inspector') return 'report_pending'
      if (this.user.role === 'viewer') return 'all'
      return 'active'
    },
    archiveMode() {
      return this.user.role === 'inspector' ? 'report_done' : 'archived'
    },
  },
  onShow() {
    this.user = getUser() || {}
    this.serverBaseUrl = getServerBaseUrl()
    this.loadStats()
  },
  methods: {
    async loadStats() {
      try {
        const all = await request({ url: '/my/steps' })
        const list = Array.isArray(all) ? all : []
        if (this.user.role === 'inspector') {
          this.stats.pending = list.filter(
            (item) => item.status === 'completed' && (!item.attachments || item.attachments.length === 0),
          ).length
          this.stats.progress = list.filter((item) => item.attachments && item.attachments.length > 0).length
          this.stats.completed = this.stats.progress
          return
        }

        if (this.user.role === 'viewer') {
          const projects = {}

          list.forEach((item) => {
            const key = item.sampleOrderId || (item.sampleOrder && item.sampleOrder.id)
            if (!key) return
            if (!projects[key]) {
              projects[key] = []
            }
            projects[key].push(item)
          })

          const projectList = Object.values(projects)
          this.stats.pending = projectList.filter(
            (steps) => steps.length && steps.every((item) => item.status === 'pending'),
          ).length
          this.stats.progress = projectList.filter(
            (steps) => steps.some((item) => item.status !== 'pending') && steps.some((item) => item.status !== 'completed'),
          ).length
          this.stats.completed = projectList.filter(
            (steps) => steps.length && steps.every((item) => item.status === 'completed'),
          ).length
          return
        }

        this.stats.pending = list.filter((item) => item.status === 'pending').length
        this.stats.progress = list.filter((item) => item.status === 'in_progress').length
        this.stats.completed = list.filter((item) => item.status === 'completed').length
      } catch (error) {
        this.stats = { pending: 0, progress: 0, completed: 0 }
      }
    },
    goTasks(mode) {
      uni.switchTab({ url: '/pages/tasks/index' })
      setTimeout(() => {
        uni.$emit('task-mode-change', mode)
      }, 80)
    },
    goAdminSamples() {
      uni.navigateTo({ url: '/pages/admin-samples/index' })
    },
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
    logout() {
      clearSession()
      uni.reLaunch({ url: '/pages/login/index' })
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

.profile-card,
.section {
  padding: 26rpx;
  margin-bottom: 18rpx;
}

.profile-top {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 28rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  font-size: 34rpx;
  font-weight: 700;
}

.profile-name {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-main);
}

.profile-role {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--text-sub);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
}

.profile-metric {
  padding: 20rpx 10rpx;
  border-radius: 18rpx;
  background: var(--bg-soft);
  text-align: center;
}

.profile-metric-value {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
}

.profile-metric-label {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--text-sub);
}

.section-title {
  margin-bottom: 12rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
}

.info-row,
.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--border-light);
}

.action-item:last-child,
.info-row:last-child {
  border-bottom: none;
}

.info-label,
.action-subtitle {
  color: var(--text-sub);
  font-size: 24rpx;
}

.info-value,
.action-title {
  color: var(--text-main);
  font-size: 26rpx;
  font-weight: 600;
}

.server-value {
  max-width: 420rpx;
  text-align: right;
  word-break: break-all;
}

.action-left {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.action-icon.pending {
  background: var(--pending-soft);
  color: var(--pending);
}

.action-icon.archived {
  background: var(--success-soft);
  color: var(--success);
}

.action-icon.config {
  background: #e0f2fe;
  color: #0369a1;
}

.action-icon.update {
  background: #dbeafe;
  color: var(--primary-dark);
}

.action-icon.admin {
  background: #ede9fe;
  color: #6d28d9;
}

.action-icon.logout {
  background: #fee2e2;
  color: #dc2626;
}

.action-arrow {
  color: var(--text-muted);
  font-size: 32rpx;
}
</style>
