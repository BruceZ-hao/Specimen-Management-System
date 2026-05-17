<template>
  <view class="page">
    <view class="header-card app-card">
      <view class="header-top">
        <view>
          <view class="header-title">{{ headerTitle }}</view>
          <view class="header-subtitle">{{ headerSubtitle }}</view>
        </view>
        <view class="count-badge">{{ filteredGroups.length }}</view>
      </view>

      <view v-if="isInspector" class="notice-card">
        <view class="notice-title">检测提醒</view>
        <view class="notice-text">当前有 {{ pendingReportCount }} 道已完成工序等待上传检测报告。</view>
      </view>

      <view class="summary-row">
        <view class="summary-item">
          <view class="icon-badge summary-icon">视</view>
          <view>
            <view class="summary-label">当前视图</view>
            <view class="summary-value">{{ currentModeLabel }}</view>
          </view>
        </view>
        <view class="summary-item">
          <view class="icon-badge summary-icon blue">{{ isInspector ? '报' : '项' }}</view>
          <view>
            <view class="summary-label">{{ isInspector ? '待上传数' : '当前项目数' }}</view>
            <view class="summary-value">{{ isInspector ? pendingReportCount : filteredGroups.length }}</view>
          </view>
        </view>
      </view>

      <view class="filters">
        <view
          v-for="item in modes"
          :key="item.value"
          class="filter"
          :class="{ active: mode === item.value }"
          @click="switchMode(item.value)"
        >
          {{ item.label }}
        </view>
      </view>

    </view>

    <view v-if="!filteredGroups.length" class="empty-card app-card">
      <view class="empty-icon">空</view>
      <view class="empty-title">当前没有任务</view>
      <view class="empty-text">{{ emptyText }}</view>
    </view>

    <view v-for="group in filteredGroups" :key="group.sampleOrderId" class="group-card app-card">
      <view class="group-top" @click="openSampleGroup(group)">
        <view>
          <view class="group-code">{{ group.sampleNo || '-' }}</view>
          <view class="group-project">{{ group.projectName || '未命名项目' }}</view>
        </view>
        <view class="status-chip" :class="groupChipClass(group)">
          {{ groupChipText(group) }}
        </view>
      </view>

      <view class="group-meta-row">
        <view class="group-meta">材料：{{ group.material || '-' }}</view>
        <view class="group-meta">{{ groupMetaText(group) }}</view>
      </view>

      <view class="task-progress-head">
        <text class="task-meta">整体进度</text>
        <text class="task-meta strong">{{ group.progress }}%</text>
      </view>
      <view class="progress-track">
        <view class="progress-bar" :style="{ width: group.progress + '%' }"></view>
      </view>

      <view class="owner-row">
        <text class="owner-text">项目操作员：{{ group.projectOperatorName || '-' }}</text>
        <text class="owner-text">项目检测员：{{ group.projectInspectorName || '-' }}</text>
      </view>

      <view class="step-list">
        <view
          v-for="step in group.displaySteps"
          :key="step.id"
          class="step-row"
          @click="openStep(step.id)"
        >
          <view class="step-left">
            <view class="step-icon" :class="statusClass(step.status)">
              {{ step.status === 'completed' ? 'OK' : step.stepOrder }}
            </view>
            <view>
              <view class="step-name">{{ step.stepName }}</view>
              <view class="step-sub">{{ stepSubText(step) }}</view>
              <view class="step-meta">工序执行人：{{ step.operatorName || '-' }}</view>
              <view v-if="isInspector" class="step-meta">最新检测员：{{ step.latestInspectorName || '-' }}</view>
              <view v-if="isInspector && step.reportPending" class="step-alert">该工序已完成，请尽快上传检测报告。</view>
            </view>
          </view>
          <view class="step-arrow">></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getServerBaseUrl, supportsDynamicServerConfig } from '../../utils/config'
import { clearSession, getUser } from '../../utils/auth'
import { formatConnectivityErrorMessage, isConnectivityError, request } from '../../utils/request'

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

function normalizeStep(step) {
  const attachments = Array.isArray(step.attachments) ? step.attachments : []
  return {
    ...step,
    attachments,
    operatorName: step.operatorUser ? step.operatorUser.name : '',
    latestInspectorName: step.latestInspectorUser ? step.latestInspectorUser.name : '',
    reportPending: step.status === 'completed' && attachments.length === 0,
    reportUploaded: attachments.length > 0,
  }
}

function buildGroup(step) {
  const order = step.sampleOrder || {}
  const allSteps = Array.isArray(order.steps) ? order.steps.map(normalizeStep) : []
  const completedAll = allSteps.filter((item) => item.status === 'completed').length
  return {
    sampleOrderId: step.sampleOrderId || order.id,
    sampleNo: order.sampleNo || '',
    projectName: order.projectName || '',
    material: order.material || '',
    orderStatus: order.status || '',
    allSteps,
    sourceSteps: [],
    progress: allSteps.length ? Math.round((completedAll / allSteps.length) * 100) : 0,
    projectOperatorId: order.operatorUserId || null,
    projectOperatorName: order.operatorUser ? order.operatorUser.name : '',
    projectInspectorId: order.inspectorUserId || null,
    projectInspectorName: order.inspectorUser ? order.inspectorUser.name : '',
  }
}

export default {
  data() {
    return {
      mode: 'active',
      rawSteps: [],
      user: {},
      supportsServerConfig: supportsDynamicServerConfig(),
      loadErrorDialogOpen: false,
    }
  },
  computed: {
    isInspector() {
      return this.user && this.user.role === 'inspector'
    },
    isViewer() {
      return this.user && this.user.role === 'viewer'
    },
    modes() {
      if (this.isInspector) {
        return [
          { label: '待上传报告', value: 'report_pending' },
          { label: '已上传报告', value: 'report_done' },
        ]
      }

      if (this.isViewer) {
        return [
          { label: '全部项目', value: 'all' },
          { label: '当前项目', value: 'active' },
          { label: '已完成项目', value: 'archived' },
        ]
      }

      return [
        { label: '待认领项目', value: 'available' },
        { label: '我的项目', value: 'active' },
        { label: '已完成项目', value: 'archived' },
      ]
    },
    headerTitle() {
      if (this.isInspector) return '检测报告任务'
      if (this.isViewer) return '项目进度看板'
      return '项目任务'
    },
    headerSubtitle() {
      if (this.isInspector) return '操作员完成工序后，这里会提醒检测员尽快上传对应报告。'
      if (this.isViewer) return '只读账号可在这里同步查看每个项目的整体进度和各工序状态。'
      return '操作员第一次开始工序时会自动认领整个项目，后续工序继续由本人处理。'
    },
    emptyText() {
      if (this.isInspector) return '当前没有待处理的检测报告任务。'
      if (this.isViewer) return '当前没有可查看的项目进度。'
      return '当前没有可处理的项目任务。'
    },
    groupedTasks() {
      const list = Array.isArray(this.rawSteps) ? this.rawSteps.map(normalizeStep) : []
      const groups = {}

      list.forEach((step) => {
        const key = step.sampleOrderId || (step.sampleOrder && step.sampleOrder.id)
        if (!key) return
        if (!groups[key]) {
          groups[key] = buildGroup(step)
        }
        groups[key].sourceSteps.push(step)
      })

      return Object.values(groups)
        .map((group) => {
          const availableStep = group.allSteps.find((item) => item.status === 'pending')
          const activeSteps = group.allSteps.filter((item) => item.status !== 'completed')
          const inspectorPending = group.allSteps.filter((item) => item.reportPending)
          const inspectorDone = group.allSteps.filter((item) => item.reportUploaded)
          const pendingCount = group.allSteps.filter((item) => item.status === 'pending').length
          const inProgressCount = group.allSteps.filter((item) => item.status === 'in_progress').length

          let displaySteps = []
          if (this.isInspector) {
            displaySteps = this.mode === 'report_done' ? inspectorDone : inspectorPending
          } else if (this.isViewer) {
            displaySteps = group.allSteps
          } else if (this.mode === 'available') {
            displaySteps = !group.projectOperatorId && availableStep ? [availableStep] : []
          } else if (this.mode === 'archived') {
            displaySteps = group.allSteps.filter((item) => item.status === 'completed')
          } else {
            displaySteps = isSameUserId(group.projectOperatorId, this.user.id) ? activeSteps : []
          }

          return {
            ...group,
            displaySteps,
            pendingCount,
            inProgressCount,
            pendingReportCount: inspectorPending.length,
            completedCount: group.allSteps.filter((item) => item.status === 'completed').length,
            notStarted: group.allSteps.length > 0 && pendingCount === group.allSteps.length,
            archived: group.allSteps.length > 0 && group.allSteps.every((item) => item.status === 'completed'),
          }
        })
        .sort((a, b) => b.sampleOrderId - a.sampleOrderId)
    },
    filteredGroups() {
      if (this.isViewer) {
        return this.groupedTasks.filter((group) => {
          if (!group.allSteps.length) return false
          if (this.mode === 'archived') return group.archived
          if (this.mode === 'active') return !group.archived
          return true
        })
      }

      return this.groupedTasks.filter((group) => group.displaySteps.length > 0)
    },
    pendingReportCount() {
      return this.groupedTasks.reduce((total, group) => total + (group.pendingReportCount || 0), 0)
    },
    currentModeLabel() {
      const current = this.modes.find((item) => item.value === this.mode)
      return current ? current.label : '-'
    },
  },
  onLoad(options) {
    this.user = getUser() || {}
    this.mode = this.isInspector
      ? 'report_pending'
      : this.isViewer
        ? options.mode || 'all'
        : options.mode || 'active'
    uni.$on('task-mode-change', this.handleExternalMode)
  },
  onUnload() {
    uni.$off('task-mode-change', this.handleExternalMode)
  },
  onShow() {
    this.user = getUser() || {}
    if (this.isInspector && this.mode !== 'report_pending' && this.mode !== 'report_done') {
      this.mode = 'report_pending'
    } else if (this.isViewer && this.mode !== 'all' && this.mode !== 'active' && this.mode !== 'archived') {
      this.mode = 'all'
    }
    this.loadData()
  },
  methods: {
    handleExternalMode(mode) {
      this.mode = mode || (this.isInspector ? 'report_pending' : this.isViewer ? 'all' : 'active')
      this.loadData()
    },
    statusClass(value) {
      return {
        pending: 'pending',
        in_progress: 'progress',
        completed: 'completed',
      }[value]
    },
    stepSubText(step) {
      if (this.isInspector) {
        return step.reportPending ? '待上传检测报告' : '已上传检测报告'
      }

      if (this.isViewer) {
        return step.status === 'completed' ? '已完成' : step.status === 'in_progress' ? '进行中' : '待开始'
      }

      if (step.status === 'pending') {
        return step.operatorUserId ? '等待继续处理' : '可开始并认领项目'
      }

      return step.status === 'completed' ? '已完成' : '进行中'
    },
    groupChipClass(group) {
      if (this.isInspector) {
        return group.pendingReportCount > 0 ? 'progress' : 'completed'
      }
      if (this.isViewer) {
        if (group.archived) return 'completed'
        return group.notStarted ? 'pending' : 'progress'
      }
      if (!group.projectOperatorId) return 'pending'
      return group.archived ? 'completed' : 'progress'
    },
    groupChipText(group) {
      if (this.isInspector) {
        return group.pendingReportCount > 0 ? '待上传' + group.pendingReportCount : '已有报告'
      }
      if (this.isViewer) {
        if (group.archived) return '已完成'
        return group.notStarted ? '未开始' : '进行中'
      }
      if (!group.projectOperatorId) return '待认领'
      return group.archived ? '已完成' : '处理中'
    },
    groupMetaText(group) {
      if (this.isInspector) {
        return '待上传 ' + group.pendingReportCount + ' / 工序 ' + group.allSteps.length
      }
      if (this.isViewer) {
        return '已完成 ' + group.completedCount + ' / ' + group.allSteps.length
      }
      if (!group.projectOperatorId) {
        return '可开始工序 ' + group.displaySteps.length
      }
      return '已完成 ' + group.completedCount + ' / ' + group.allSteps.length
    },
    async loadData() {
      try {
        const data = await request({ url: '/my/steps' })
        this.rawSteps = Array.isArray(data) ? data : []
      } catch (error) {
        this.rawSteps = []
        this.handleLoadFailure(error)
      }
    },
    openServerSettings() {
      if (!this.supportsServerConfig) {
        return
      }

      uni.navigateTo({ url: '/pages/server-settings/index' })
    },
    handleLoadFailure(error) {
      if (error?.statusCode === 401) {
        clearSession()
        uni.showToast({ title: '请重新登录', icon: 'none' })
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/login/index' })
        }, 300)
        return
      }

      if (isConnectivityError(error)) {
        if (this.loadErrorDialogOpen) {
          return
        }

        this.loadErrorDialogOpen = true
        uni.showModal({
          title: '连接失败',
          content: formatConnectivityErrorMessage({
            ...error,
            serverBaseUrl: error?.serverBaseUrl || getServerBaseUrl(),
          }),
          confirmText: this.supportsServerConfig ? '服务器配置' : '确定',
          cancelText: this.supportsServerConfig ? '稍后重试' : '关闭',
          showCancel: this.supportsServerConfig,
          success: ({ confirm }) => {
            if (confirm && this.supportsServerConfig) {
              this.openServerSettings()
            }
          },
          complete: () => {
            this.loadErrorDialogOpen = false
          },
        })
        return
      }

      uni.showToast({ title: '数据加载失败', icon: 'none' })
    },
    switchMode(value) {
      this.mode = value
    },
    openSampleGroup(group) {
      const firstStep = group.displaySteps[0]
      if (!firstStep) return
      uni.navigateTo({
        url: '/pages/sample/index?id=' + group.sampleOrderId + '&stepId=' + firstStep.id,
      })
    },
    openStep(stepId) {
      uni.navigateTo({
        url: '/pages/step/index?id=' + stepId,
      })
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

.header-card,
.group-card,
.empty-card {
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.header-top,
.group-top,
.group-meta-row,
.task-progress-head,
.step-row,
.owner-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--text-main);
}

.header-subtitle {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--text-sub);
  line-height: 1.6;
}

.notice-card {
  margin-top: 22rpx;
  padding: 20rpx 22rpx;
  border-radius: 20rpx;
  background: #fff7ed;
}

.notice-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #c2410c;
}

.notice-text {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #9a3412;
}

.count-badge {
  min-width: 64rpx;
  height: 64rpx;
  line-height: 64rpx;
  text-align: center;
  border-radius: 20rpx;
  background: #dbeafe;
  color: var(--primary-dark);
  font-size: 28rpx;
  font-weight: 700;
}

.summary-row {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
}

.summary-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--bg-soft);
}

.summary-icon {
  background: var(--pending-soft);
  color: #334155;
}

.summary-icon.blue {
  background: #dbeafe;
  color: var(--primary-dark);
}

.summary-label {
  font-size: 22rpx;
  color: var(--text-sub);
}

.summary-value {
  margin-top: 6rpx;
  font-size: 26rpx;
  color: var(--text-main);
  font-weight: 700;
}

.filters {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
}

.filter {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 18rpx;
  background: #f1f5f9;
  color: var(--text-sub);
  font-size: 26rpx;
  font-weight: 600;
}

.filter.active {
  background: var(--primary-dark);
  color: #fff;
}

.group-code {
  font-size: 24rpx;
  color: var(--text-sub);
}

.group-project {
  margin-top: 10rpx;
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
}

.group-meta-row {
  margin-top: 18rpx;
}

.group-meta,
.task-meta,
.owner-text {
  color: var(--text-sub);
  font-size: 24rpx;
}

.task-progress-head {
  margin-top: 18rpx;
  margin-bottom: 10rpx;
}

.task-meta.strong {
  color: var(--primary-dark);
  font-weight: 700;
}

.owner-row {
  margin-top: 14rpx;
  gap: 12rpx;
  flex-wrap: wrap;
}

.step-list {
  margin-top: 18rpx;
  border-top: 1rpx solid var(--border-light);
}

.step-row {
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--border-light);
}

.step-row:last-child {
  border-bottom: none;
}

.step-left {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.step-icon {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  border-radius: 16rpx;
  font-size: 20rpx;
  font-weight: 700;
  background: var(--pending-soft);
  color: var(--pending);
  flex-shrink: 0;
}

.step-icon.progress {
  background: #dbeafe;
  color: var(--primary-dark);
}

.step-icon.completed {
  background: var(--success-soft);
  color: var(--success);
}

.step-name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
}

.step-sub,
.step-meta {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--text-sub);
}

.step-alert {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #d97706;
}

.step-arrow {
  color: var(--text-muted);
  font-size: 32rpx;
}

.empty-card {
  text-align: center;
  padding: 56rpx 32rpx;
}

.empty-icon {
  font-size: 56rpx;
  color: var(--text-muted);
}

.empty-title {
  margin-top: 16rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #334155;
}

.empty-text {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--text-muted);
  line-height: 1.6;
}
</style>
