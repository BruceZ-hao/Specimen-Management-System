<template>
  <view class="page">
    <view class="panel app-card">
      <view class="panel-title">新建样品</view>
      <view class="field">
        <view class="field-label">样品编号</view>
        <input v-model="form.sampleNo" class="input" placeholder="例如 XM-001" />
      </view>
      <view class="field">
        <view class="field-label">项目名称</view>
        <input v-model="form.projectName" class="input" placeholder="请输入项目名称" />
      </view>
      <view class="field">
        <view class="field-label">报告存储路径</view>
        <input v-model="form.reportStoragePath" class="input" placeholder="例如 D:\Reports\JNRon 或 uploads/reports" />
      </view>
      <view class="field-row">
        <view class="field half">
          <view class="field-label">客户名称</view>
          <input v-model="form.customerName" class="input" placeholder="客户名称" />
        </view>
        <view class="field half">
          <view class="field-label">材料</view>
          <input v-model="form.material" class="input" placeholder="材料" />
        </view>
      </view>
      <view class="field-row">
        <view class="field half">
          <view class="field-label">压机吨位</view>
          <input v-model="form.pressTonnage" class="input" placeholder="100T" />
        </view>
        <view class="field half">
          <view class="field-label">开始日期</view>
          <input v-model="form.startDate" class="input" placeholder="2026-05-01" />
        </view>
      </view>
      <view class="field">
        <view class="field-label">备注</view>
        <textarea v-model="form.remark" class="textarea" placeholder="补充说明" />
      </view>

      <view class="steps-head">
        <view class="panel-subtitle">工序配置</view>
        <view class="mini-action" @click="addStep">+ 添加工序</view>
      </view>

      <view v-for="(step, index) in form.steps" :key="index" class="step-card">
        <view class="step-top">
          <view class="step-index">工序 {{ index + 1 }}</view>
          <view class="step-delete" @click="removeStep(index)">删除</view>
        </view>
        <input v-model="step.stepName" class="input" placeholder="如：成型 / 烧结 / 研磨" />
        <textarea v-model="step.remark" class="textarea small-textarea" placeholder="工序备注（可选）" />
      </view>

      <button class="button" @click="createSample">创建样品</button>
    </view>

    <view class="panel app-card">
      <view class="panel-title">样品管理</view>
      <view class="panel-subtitle">列表按时间倒序，可直接删除项目。</view>
      <view v-if="!samples.length" class="empty-text">当前没有样品数据</view>

      <view v-for="sample in samples" :key="sample.id" class="sample-card">
        <view class="sample-top">
          <view>
            <view class="sample-code">{{ sample.sampleNo }}</view>
            <view class="sample-name">{{ sample.projectName }}</view>
          </view>
          <view class="status-chip" :class="sample.status === 'completed' ? 'completed' : sample.status === 'in_progress' ? 'progress' : 'pending'">
            {{ statusText(sample.status) }}
          </view>
        </view>
        <view class="sample-meta">客户：{{ sample.customerName || '-' }} | 材料：{{ sample.material || '-' }}</view>
        <view class="sample-actions">
          <view class="sample-action danger" @click="deleteSample(sample)">删除样品</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { request } from '../../utils/request'

export default {
  data() {
    return {
      samples: [],
      form: {
        sampleNo: '',
        projectName: '',
        reportStoragePath: '',
        customerName: '',
        material: '',
        pressTonnage: '',
        startDate: '',
        remark: '',
        steps: [],
      },
    }
  },
  onShow() {
    this.loadSamples()
    if (!this.form.steps.length) {
      this.addStep()
    }
  },
  methods: {
    statusText(value) {
      return {
        draft: '待开始',
        in_progress: '进行中',
        completed: '已完成',
      }[value] || value || '-'
    },
    async loadSamples() {
      const data = await request({ url: '/samples?page=1&pageSize=50' })
      this.samples = data && Array.isArray(data.items) ? data.items : []
    },
    addStep() {
      this.form.steps.push({
        stepName: '',
        remark: '',
      })
    },
    removeStep(index) {
      this.form.steps.splice(index, 1)
      if (!this.form.steps.length) {
        this.addStep()
      }
    },
    resetForm() {
      this.form = {
        sampleNo: '',
        projectName: '',
        reportStoragePath: '',
        customerName: '',
        material: '',
        pressTonnage: '',
        startDate: '',
        remark: '',
        steps: [],
      }
      this.addStep()
    },
    async createSample() {
      try {
        if (!String(this.form.reportStoragePath || '').trim()) {
          uni.showToast({ title: '请填写报告路径', icon: 'none' })
          return
        }

        const payload = {
          ...this.form,
          reportStoragePath: this.form.reportStoragePath.trim(),
          steps: this.form.steps.map((step, index) => ({
            stepName: step.stepName,
            stepOrder: index + 1,
            remark: step.remark,
          })),
        }
        await request({ url: '/samples', method: 'POST', data: payload })
        uni.showToast({ title: '创建成功', icon: 'success' })
        this.resetForm()
        this.loadSamples()
      } catch (error) {
        uni.showToast({ title: '创建失败', icon: 'none' })
      }
    },
    deleteSample(sample) {
      uni.showModal({
        title: '删除确认',
        content: `确定删除样品 ${sample.sampleNo} 吗？`,
        success: async (res) => {
          if (!res.confirm) return
          try {
            await request({ url: `/samples/${sample.id}`, method: 'DELETE' })
            uni.showToast({ title: '删除成功', icon: 'success' })
            this.loadSamples()
          } catch (error) {
            uni.showToast({ title: '删除失败', icon: 'none' })
          }
        },
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

.panel {
  padding: 26rpx;
  margin-bottom: 18rpx;
}

.panel-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
}

.panel-subtitle {
  margin-top: 8rpx;
  margin-bottom: 18rpx;
  font-size: 22rpx;
  color: var(--text-sub);
}

.field,
.field-row {
  margin-bottom: 18rpx;
}

.field-row {
  display: flex;
  gap: 14rpx;
}

.field.half {
  flex: 1;
}

.field-label {
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: var(--text-sub);
}

.input,
.textarea {
  width: 100%;
  min-height: 88rpx;
  border-radius: 18rpx;
  background: var(--bg-soft);
  border: 2rpx solid #dbe3ef;
  padding: 0 22rpx;
  box-sizing: border-box;
}

.input {
  line-height: 88rpx;
}

.textarea {
  padding-top: 18rpx;
  height: 160rpx;
}

.small-textarea {
  height: 120rpx;
  margin-top: 12rpx;
}

.steps-head,
.step-top,
.sample-top,
.sample-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mini-action,
.step-delete,
.sample-action {
  color: var(--primary);
  font-size: 24rpx;
}

.step-card,
.sample-card {
  margin-bottom: 16rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: var(--bg-soft);
}

.step-index,
.sample-code {
  font-size: 24rpx;
  color: var(--text-sub);
}

.sample-name {
  margin-top: 8rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-main);
}

.sample-meta {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--text-sub);
}

.sample-actions {
  margin-top: 14rpx;
}

.sample-action.danger,
.step-delete {
  color: #dc2626;
}

.button {
  margin-top: 12rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
}

.empty-text {
  margin-top: 12rpx;
  color: var(--text-sub);
  font-size: 24rpx;
}
</style>
