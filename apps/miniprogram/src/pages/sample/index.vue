<template>
  <view v-if="detail" class="page">
    <view class="hero-card app-card">
      <view class="hero-code">{{ detail.sampleNo }}</view>
      <view class="hero-title">{{ detail.projectName }}</view>
      <view class="hero-meta-row">
        <view class="hero-tag">材料：{{ detail.material || '-' }}</view>
        <view class="hero-tag">{{ statusText(detail.status) }}</view>
      </view>
    </view>

    <view class="section-card app-card">
      <view class="section-header">
        <view class="section-title">项目信息</view>
      </view>
      <view class="info-grid">
        <view class="info-item">
          <view class="info-label">客户</view>
          <view class="info-value">{{ detail.customerName || '-' }}</view>
        </view>
        <view class="info-item">
          <view class="info-label">压机吨位</view>
          <view class="info-value">{{ detail.pressTonnage || '-' }}</view>
        </view>
        <view class="info-item">
          <view class="info-label">项目操作员</view>
          <view class="info-value">{{ projectOperatorName }}</view>
        </view>
        <view class="info-item">
          <view class="info-label">项目检测员</view>
          <view class="info-value">{{ projectInspectorName }}</view>
        </view>
        <view class="info-item">
          <view class="info-label">图纸数量</view>
          <view class="info-value">{{ projectAttachments.length }}</view>
        </view>
        <view class="info-item">
          <view class="info-label">工序数量</view>
          <view class="info-value">{{ detail.steps.length }}</view>
        </view>
      </view>
    </view>

    <view class="section-card app-card">
      <view class="section-header">
        <view class="section-title">工序流程</view>
        <view class="section-side">{{ completedCount }}/{{ detail.steps.length }}</view>
      </view>
      <view class="progress-panel">
        <view class="progress-panel-head">
          <text class="progress-label">整体完成度</text>
          <text class="progress-value">{{ progressPercent }}%</text>
        </view>
        <view class="progress-track">
          <view class="progress-bar" :style="{ width: progressPercent + '%' }"></view>
        </view>
      </view>

      <view
        v-for="step in detail.steps"
        :key="step.id"
        class="step-item"
        :class="{ current: step.id === currentStepId }"
        @click="openStep(step.id)"
      >
        <view class="step-left">
          <view class="step-order" :class="statusClass(step.status)">
            {{ step.status === 'completed' ? 'OK' : step.stepOrder }}
          </view>
          <view class="step-main">
            <view class="step-name">{{ step.stepName }}</view>
            <view class="step-meta">工序执行人：{{ operatorName(step) }}</view>
            <view class="step-meta">最新检测员：{{ latestInspectorName(step) }}</view>
          </view>
        </view>
        <view class="step-status" :class="statusClass(step.status)">
          {{ statusText(step.status) }}
        </view>
      </view>
    </view>

    <view v-if="projectAttachments.length" class="section-card app-card">
      <view class="section-header">
        <view class="section-title">图纸附件</view>
      </view>
      <view
        v-for="file in projectAttachments"
        :key="file.id"
        class="file-item"
        @click="previewFile(file.id)"
      >
        <view class="file-left">
          <view class="file-icon">图</view>
          <view class="file-name">{{ file.fileName }}</view>
        </view>
        <view class="file-arrow">></view>
      </view>
    </view>
  </view>
</template>

<script>
import { request } from '../../utils/request'
import { buildAttachmentFileUrl, previewAuthenticatedImage } from '../../utils/file'

export default {
  data() {
    return {
      detail: null,
      currentStepId: 0,
      sampleId: 0,
    }
  },
  computed: {
    completedCount() {
      if (!this.detail) return 0
      return this.detail.steps.filter((step) => step.status === 'completed').length
    },
    progressPercent() {
      if (!this.detail || !this.detail.steps.length) return 0
      return Math.round((this.completedCount / this.detail.steps.length) * 100)
    },
    projectAttachments() {
      if (!this.detail || !Array.isArray(this.detail.attachments)) return []
      return this.detail.attachments.filter((item) => !item.sampleStepId)
    },
    projectOperatorName() {
      if (!this.detail || !this.detail.operatorUser) return '-'
      return this.detail.operatorUser.name || '-'
    },
    projectInspectorName() {
      if (!this.detail || !this.detail.inspectorUser) return '-'
      return this.detail.inspectorUser.name || '-'
    },
  },
  onLoad(options) {
    this.currentStepId = Number(options.stepId || 0)
    this.sampleId = Number(options.id || 0)
    this.loadDetail(this.sampleId)
  },
  onShow() {
    if (this.sampleId) {
      this.loadDetail(this.sampleId)
    }
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
        draft: '待开始',
        pending: '待开始',
        in_progress: '进行中',
        completed: '已完成',
      }[value] || value || '-'
    },
    operatorName(step) {
      return step && step.operatorUser && step.operatorUser.name ? step.operatorUser.name : '-'
    },
    latestInspectorName(step) {
      return step && step.latestInspectorUser && step.latestInspectorUser.name ? step.latestInspectorUser.name : '-'
    },
    async previewFile(attachmentId) {
      try {
        uni.showLoading({ title: '加载中...', mask: true })
        await previewAuthenticatedImage(buildAttachmentFileUrl(attachmentId))
      } catch (error) {
        uni.showToast({ title: '图片预览失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    },
    async loadDetail(id) {
      const data = await request({ url: '/samples/' + id })
      this.detail = data && typeof data === 'object' ? data : null
    },
    openStep(stepId) {
      uni.navigateTo({ url: '/pages/step/index?id=' + stepId })
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

.hero-card {
  padding: 30rpx;
  background: linear-gradient(135deg, var(--bg-dark-soft), var(--bg-dark));
  color: #fff;
  margin-bottom: 18rpx;
}

.hero-code {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.72);
}

.hero-title {
  margin-top: 12rpx;
  font-size: 40rpx;
  font-weight: 700;
}

.hero-meta-row {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
  flex-wrap: wrap;
}

.hero-tag {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.12);
  font-size: 22rpx;
}

.section-card {
  padding: 26rpx;
  margin-bottom: 18rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
}

.section-side {
  font-size: 24rpx;
  color: var(--text-sub);
}

.progress-panel {
  margin-bottom: 10rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: var(--bg-soft);
}

.progress-panel-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.progress-label {
  color: var(--text-sub);
  font-size: 22rpx;
}

.progress-value {
  color: var(--primary-dark);
  font-size: 24rpx;
  font-weight: 700;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.info-item {
  padding: 20rpx;
  border-radius: 18rpx;
  background: var(--bg-soft);
}

.info-label {
  font-size: 22rpx;
  color: var(--text-sub);
}

.info-value {
  margin-top: 10rpx;
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 700;
}

.step-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #edf2f7;
}

.step-item:last-child {
  border-bottom: none;
}

.step-item.current {
  background: #f8fbff;
}

.step-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.step-order {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  border-radius: 16rpx;
  background: #e5e7eb;
  color: #475569;
  font-size: 24rpx;
  font-weight: 700;
}

.step-order.progress {
  background: #dbeafe;
  color: var(--primary-dark);
}

.step-order.completed {
  background: var(--success-soft);
  color: var(--success);
}

.step-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.step-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
}

.step-meta {
  font-size: 22rpx;
  color: var(--text-sub);
}

.step-status {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--text-sub);
}

.step-status.progress {
  color: var(--primary-dark);
}

.step-status.completed {
  color: var(--success);
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #edf2f7;
}

.file-item:last-child {
  border-bottom: none;
}

.file-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.file-icon {
  width: 52rpx;
  height: 52rpx;
  line-height: 52rpx;
  text-align: center;
  border-radius: 14rpx;
  background: #dbeafe;
  color: var(--primary-dark);
  font-size: 24rpx;
  font-weight: 700;
}

.file-name {
  font-size: 26rpx;
  color: var(--text-main);
}

.file-arrow {
  font-size: 32rpx;
  color: var(--text-muted);
}
</style>
