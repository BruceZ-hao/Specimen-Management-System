<template>
  <view v-if="step" class="page">
    <view class="hero-card">
      <view class="hero-top">
        <view>
          <view class="hero-code">{{ sampleNo }}</view>
          <view class="hero-title">{{ step.stepName }}</view>
        </view>
        <view class="hero-status" :class="statusClass(step.status)">
          {{ statusText(step.status) }}
        </view>
      </view>
      <view class="hero-project">{{ projectName }}</view>
    </view>

    <view v-if="canManageReports && attachments.length === 0" class="notice-card">
      <view class="notice-title">待上传检测报告</view>
      <view class="notice-text">操作员已完成该工序，请尽快上传对应检测报告。</view>
    </view>

    <view class="section-card">
      <view class="section-title">工序信息</view>
      <view class="info-row">
        <text class="info-label">项目名称</text>
        <text class="info-value">{{ projectName || '-' }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">样品编号</text>
        <text class="info-value">{{ sampleNo || '-' }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">当前状态</text>
        <text class="info-value">{{ statusText(step.status) }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">项目操作员</text>
        <text class="info-value">{{ projectOperatorName }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">项目检测员</text>
        <text class="info-value">{{ projectInspectorName }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">工序执行人</text>
        <text class="info-value">{{ operatorName }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">最新检测员</text>
        <text class="info-value">{{ latestInspectorName }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">开始时间</text>
        <text class="info-value">{{ formatTime(step.startedAt) }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">完成时间</text>
        <text class="info-value">{{ formatTime(step.completedAt) }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">报告路径</text>
        <text class="info-value path-value">{{ reportStoragePath }}</text>
      </view>
    </view>

    <view class="section-card">
      <view class="section-title">检测报告</view>
      <view v-if="attachments.length" class="report-list">
        <view v-for="file in attachments" :key="file.id" class="report-row" @click="previewReport(file.id)">
          <view class="report-main">
            <text class="report-name">{{ file.fileName }}</text>
            <text class="report-meta">上传人：{{ uploaderName(file) }} | {{ formatTime(file.createdAt) }}</text>
          </view>
          <view class="report-actions">
            <text class="report-action">查看</text>
            <text v-if="supportsWechatShare" class="report-share" @click.stop="shareReport(file)">分享</text>
            <text
              v-if="canManageReports"
              class="report-delete"
              @click.stop="removeReport(file)"
            >
              删除
            </text>
          </view>
        </view>
      </view>
      <view v-else class="helper-text">当前工序还没有上传检测报告。</view>
    </view>

    <view class="section-card">
      <view class="section-title">操作</view>

      <template v-if="isOperator">
        <button
          v-if="step.status === 'pending' && canStartStep"
          class="button primary"
          @click="startStep"
        >
          {{ startButtonText }}
        </button>
        <button
          v-if="step.status === 'in_progress' && isSameUser(projectOperatorId, user.id) && isSameUser(step.operatorUserId, user.id)"
          class="button success"
          @click="completeStep"
        >
          完成工序
        </button>
        <view class="helper-text">{{ operatorHint }}</view>
      </template>

      <template v-else-if="canManageReports">
        <button
          v-if="step.status === 'completed'"
          class="button warning"
          @click="uploadInspectionPhoto"
        >
          上传检测报告
        </button>
        <view class="helper-text">{{ inspectorHint }}</view>
      </template>

      <view v-if="step.status === 'completed'" class="done-card">
        <view class="done-icon">OK</view>
        <view class="done-text">{{ completedBannerText }}</view>
      </view>
    </view>
  </view>
</template>

<script>
import { getUser } from '../../utils/auth'
import { supportsWechatImageShare } from '../../utils/config'
import { request, uploadFile } from '../../utils/request'
import { shareImageToWechat } from '../../utils/share'
import { buildAttachmentFileUrl, previewAuthenticatedImage } from '../../utils/file'
import { chooseReportImage, getChosenImagePath } from '../../utils/media'

function normalizeId(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  return String(value)
}

function isSameUserId(left, right) {
  const normalizedLeft = normalizeId(left)
  const normalizedRight = normalizeId(right)

  return normalizedLeft !== '' && normalizedLeft === normalizedRight
}

export default {
  data() {
    return {
      step: null,
      stepId: 0,
      user: {},
      supportsWechatShare: supportsWechatImageShare(),
    }
  },
  computed: {
    isInspector() {
      return !!(this.user && this.user.role === 'inspector')
    },
    isOperator() {
      return !!(this.user && this.user.role === 'operator')
    },
    isAdmin() {
      return !!(this.user && this.user.role === 'admin')
    },
    sampleOrder() {
      return this.step && this.step.sampleOrder ? this.step.sampleOrder : {}
    },
    sampleNo() {
      return this.sampleOrder.sampleNo || ''
    },
    projectName() {
      return this.sampleOrder.projectName || ''
    },
    reportStoragePath() {
      return this.sampleOrder.reportStoragePath || '-'
    },
    projectOperatorId() {
      return this.sampleOrder.operatorUserId || null
    },
    projectOperatorName() {
      return this.sampleOrder.operatorUser && this.sampleOrder.operatorUser.name ? this.sampleOrder.operatorUser.name : '-'
    },
    projectInspectorName() {
      return this.sampleOrder.inspectorUser && this.sampleOrder.inspectorUser.name ? this.sampleOrder.inspectorUser.name : '-'
    },
    operatorName() {
      return this.step && this.step.operatorUser && this.step.operatorUser.name ? this.step.operatorUser.name : '-'
    },
    latestInspectorName() {
      return this.step && this.step.latestInspectorUser && this.step.latestInspectorUser.name ? this.step.latestInspectorUser.name : '-'
    },
    attachments() {
      if (this.step && Array.isArray(this.step.attachments)) {
        return this.step.attachments
      }
      return []
    },
    canManageReports() {
      if (!this.step || this.step.status !== 'completed') return false
      if (this.isAdmin) return true
      if (!this.isInspector) return false
      return !this.sampleOrder.inspectorUserId || this.isSameUser(this.sampleOrder.inspectorUserId, this.user.id)
    },
    canStartStep() {
      if (!this.step || !this.isOperator || this.step.status !== 'pending') return false
      return !this.projectOperatorId || this.isSameUser(this.projectOperatorId, this.user.id)
    },
    startButtonText() {
      return this.projectOperatorId ? '开始工序' : '开始并认领项目'
    },
    operatorHint() {
      if (!this.step) return ''
      if (!this.projectOperatorId) {
        return '开始当前工序后，将自动认领整个项目，后续工序继续由你处理。'
      }
      if (this.isSameUser(this.projectOperatorId, this.user.id)) {
        return '该项目已由你认领，后续工序继续按顺序完成。'
      }
      return '该项目已由其他操作员认领，你不能继续处理。'
    },
    inspectorHint() {
      if (!this.step) return ''
      if (this.step.status !== 'completed') {
        return '请等待操作员先完成该工序。'
      }
      if (this.isAdmin) {
        return '管理员可以直接上传、替换或删除检测报告。'
      }
      if (!this.sampleOrder.inspectorUserId || this.isSameUser(this.sampleOrder.inspectorUserId, this.user.id)) {
        return '支持拍照或从本地选择图片；在 App 里也可以直接分享到微信。'
      }
      return '该项目已由其他检测员认领，你不能继续上传。'
    },
    completedBannerText() {
      if (this.isOperator) {
        return '该工序已完成'
      }
      return this.attachments.length ? '检测报告已上传' : '工序已完成，等待上传检测报告'
    },
  },
  onLoad(options) {
    this.stepId = Number(options.id)
    this.user = getUser() || {}
    this.loadStep()
  },
  onShow() {
    this.user = getUser() || {}
  },
  methods: {
    statusClass(value) {
      return {
        pending: 'pending',
        in_progress: 'progress',
        completed: 'completed',
      }[value]
    },
    statusText(value) {
      return {
        pending: '待开始',
        in_progress: '进行中',
        completed: '已完成',
      }[value] || value || '-'
    },
    uploaderName(file) {
      return file && file.uploader && file.uploader.name ? file.uploader.name : '-'
    },
    formatTime(value) {
      if (!value) return '-'
      return String(value).replace('T', ' ').slice(0, 19)
    },
    isSameUser(left, right) {
      return isSameUserId(left, right)
    },
    extractErrorMessage(error, fallback) {
      if (error && typeof error === 'object') {
        if (typeof error.message === 'string' && error.message.trim()) {
          return error.message
        }
        if (typeof error.errMsg === 'string' && error.errMsg.trim()) {
          return error.errMsg
        }
      }
      return fallback
    },
    async loadStep() {
      const data = await request({ url: '/steps/' + this.stepId })
      this.step = data && typeof data === 'object' ? data : null
    },
    async startStep() {
      try {
        await request({ url: '/steps/' + this.stepId + '/start', method: 'POST' })
        uni.$emit('task-mode-change', 'active')
        uni.showToast({ title: '已认领并开始', icon: 'success' })
        await this.loadStep()
      } catch (error) {
        uni.showToast({ title: this.extractErrorMessage(error, '开始失败').slice(0, 30), icon: 'none' })
      }
    },
    async completeStep() {
      try {
        await request({ url: '/steps/' + this.stepId + '/complete', method: 'POST' })
        uni.showToast({ title: '已完成', icon: 'success' })
        await this.loadStep()
        setTimeout(() => {
          uni.navigateBack()
        }, 400)
      } catch (error) {
        uni.showToast({ title: this.extractErrorMessage(error, '完成失败').slice(0, 30), icon: 'none' })
      }
    },
    async uploadInspectionPhoto() {
      try {
        const imageResult = await chooseReportImage()
        if (!imageResult.ok) {
          if (imageResult.reason !== 'cancelled' && imageResult.reason !== 'permission-denied') {
            uni.showToast({ title: '无法调用相机或相册', icon: 'none' })
          }
          return
        }

        const filePath = getChosenImagePath(imageResult)
        if (!filePath) return

        await uploadFile({
          url: '/steps/' + this.stepId + '/report-photo',
          filePath,
        })
        uni.showToast({ title: '检测报告已上传', icon: 'success' })
        await this.loadStep()
      } catch (error) {
        uni.showToast({ title: this.extractErrorMessage(error, '上传失败').slice(0, 30), icon: 'none' })
      }
    },
    async shareReport(file) {
      if (!file || !file.id) return

      try {
        uni.showLoading({ title: '准备分享...', mask: true })
        await shareImageToWechat({
          imageUrl: buildAttachmentFileUrl(file.id),
          title: file.fileName || '检测报告',
        })
        uni.showToast({ title: '已拉起微信分享', icon: 'success' })
      } catch (error) {
        uni.showToast({
          title: this.extractErrorMessage(error, '分享失败').slice(0, 30),
          icon: 'none',
        })
      } finally {
        uni.hideLoading()
      }
    },
    removeReport(file) {
      uni.showModal({
        title: '删除确认',
        content: `确定删除 ${file.fileName} 吗？`,
        success: async (res) => {
          if (!res.confirm) return
          try {
            await request({
              url: '/steps/' + this.stepId + '/report-attachments/' + file.id,
              method: 'DELETE',
            })
            uni.showToast({ title: '删除成功', icon: 'success' })
            await this.loadStep()
          } catch (error) {
            uni.showToast({ title: this.extractErrorMessage(error, '删除失败').slice(0, 30), icon: 'none' })
          }
        },
      })
    },
    async previewReport(attachmentId) {
      try {
        uni.showLoading({ title: '加载中...', mask: true })
        await previewAuthenticatedImage(buildAttachmentFileUrl(attachmentId))
      } catch (error) {
        uni.showToast({ title: this.extractErrorMessage(error, '图片预览失败').slice(0, 30), icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #eef2f7;
}

.hero-card,
.section-card,
.notice-card {
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 10rpx 32rpx rgba(15, 23, 42, 0.06);
}

.hero-card {
  padding: 28rpx;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  color: #fff;
  margin-bottom: 18rpx;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: flex-start;
}

.hero-code {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}

.hero-title {
  margin-top: 10rpx;
  font-size: 40rpx;
  font-weight: 700;
}

.hero-project {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.82);
}

.hero-status {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.14);
}

.hero-status.progress {
  background: rgba(59, 130, 246, 0.22);
}

.hero-status.completed {
  background: rgba(34, 197, 94, 0.22);
}

.notice-card {
  margin-bottom: 18rpx;
  padding: 24rpx 26rpx;
  background: #fff7ed;
}

.notice-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #c2410c;
}

.notice-text {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #9a3412;
}

.section-card {
  padding: 26rpx;
  margin-bottom: 18rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 12rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #edf2f7;
  gap: 20rpx;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: #64748b;
  font-size: 24rpx;
}

.info-value {
  color: #0f172a;
  font-size: 24rpx;
  font-weight: 600;
  text-align: right;
}

.path-value {
  max-width: 420rpx;
  word-break: break-all;
}

.report-list {
  display: grid;
  gap: 14rpx;
}

.report-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #edf2f7;
}

.report-row:last-child {
  border-bottom: none;
}

.report-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.report-name {
  color: #0f172a;
  font-size: 24rpx;
  font-weight: 600;
  word-break: break-all;
}

.report-meta {
  color: #64748b;
  font-size: 22rpx;
}

.report-actions {
  display: flex;
  align-items: center;
  gap: 18rpx;
  flex-shrink: 0;
}

.report-action {
  color: #2563eb;
  font-size: 24rpx;
}

.report-share {
  color: #16a34a;
  font-size: 24rpx;
}

.report-delete {
  color: #dc2626;
  font-size: 24rpx;
}

.button {
  margin-top: 12rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 18rpx;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
}

.button.primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.button.success {
  background: linear-gradient(135deg, #16a34a, #15803d);
}

.button.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.helper-text {
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}

.done-card {
  margin-top: 16rpx;
  padding: 34rpx 20rpx;
  border-radius: 22rpx;
  background: #f0fdf4;
  text-align: center;
}

.done-icon {
  font-size: 36rpx;
  color: #15803d;
  font-weight: 700;
}

.done-text {
  margin-top: 10rpx;
  font-size: 28rpx;
  color: #166534;
  font-weight: 700;
}
</style>
