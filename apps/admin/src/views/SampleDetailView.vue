<template>
  <section v-if="detail" class="page-card">
    <div class="toolbar">
      <h2>{{ detail.sampleNo }} - {{ detail.projectName }}</h2>
      <div class="toolbar-actions">
        <el-button @click="router.push('/samples')">返回</el-button>
        <el-button type="primary" @click="router.push(`/samples/${detail.id}/edit`)">编辑</el-button>
        <el-button type="danger" plain @click="removeSample">删除</el-button>
      </div>
    </div>

    <el-descriptions :column="2" border>
      <el-descriptions-item label="客户">{{ detail.customerName || '-' }}</el-descriptions-item>
      <el-descriptions-item label="材料">{{ detail.material || '-' }}</el-descriptions-item>
      <el-descriptions-item label="压机吨位">{{ detail.pressTonnage || '-' }}</el-descriptions-item>
      <el-descriptions-item label="项目状态">
        <div class="status-block">
          <div class="status-editor">
            <el-select v-model="sampleStatus" class="status-select">
              <el-option
                v-for="item in sampleStatusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-button
              type="primary"
              :disabled="sampleStatus === detail.status"
              :loading="savingSampleStatus"
              @click="saveSampleStatus"
            >
              保存
            </el-button>
          </div>
          <div class="status-hint">管理员手动修改项目状态后，后续工序状态变化仍可能触发系统自动刷新。</div>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="开始时间">{{ detail.startDate || '-' }}</el-descriptions-item>
      <el-descriptions-item label="报告存储路径">{{ detail.reportStoragePath || '-' }}</el-descriptions-item>
      <el-descriptions-item label="项目操作员">
        <div class="ownership-block">
          <span>{{ detail.operatorUser?.name || '-' }}</span>
          <el-button
            size="small"
            :disabled="!detail.operatorUserId"
            :loading="resettingOperator"
            @click="resetOperatorOwnership"
          >
            重置操作员归属
          </el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="项目检测员">
        <div class="ownership-block">
          <span>{{ detail.inspectorUser?.name || '-' }}</span>
          <el-button
            size="small"
            :disabled="!detail.inspectorUserId"
            :loading="resettingInspector"
            @click="resetInspectorOwnership"
          >
            重置检测员归属
          </el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
    </el-descriptions>

    <div class="page-card section-card">
      <h3>归属重置说明</h3>
      <div class="hint-list">
        <div>重置操作员归属会清空项目操作员，并把进行中的工序退回待开始，让项目重新可认领。</div>
        <div>重置检测员归属会清空项目检测员，并清除工序上的最新检测员标记。</div>
        <div>已完成工序的完成状态不会因为重置归属被抹掉。</div>
      </div>
    </div>

    <div class="page-card section-card">
      <h3>图纸附件</h3>
      <el-empty v-if="!projectAttachments.length" description="暂无图纸" />
      <el-link
        v-for="file in projectAttachments"
        :key="file.id"
        :href="buildAttachmentUrl(file.id)"
        target="_blank"
        class="attachment-link"
      >
        {{ file.fileName }}
      </el-link>
    </div>

    <div class="page-card section-card">
      <div class="toolbar">
        <h3>工序进度</h3>
        <span>完成度 {{ progress }}%</span>
      </div>
      <el-timeline>
        <el-timeline-item
          v-for="step in detail.steps"
          :key="step.id"
          :timestamp="step.completedAt || step.startedAt || '未开始'"
          :type="step.status === 'completed' ? 'success' : step.status === 'in_progress' ? 'primary' : 'info'"
        >
          <div class="step-card">
            <div class="step-head">
              <strong>{{ step.stepOrder }}. {{ step.stepName }}</strong>
              <div class="status-block step-status-block">
                <div class="status-editor">
                  <el-select
                    v-model="stepStatusMap[step.id]"
                    class="status-select"
                    @change="markStepDirty(step.id)"
                  >
                    <el-option
                      v-for="item in stepStatusOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-button
                    type="primary"
                    :disabled="!isStepDirty(step.id)"
                    :loading="savingStepIds.includes(step.id)"
                    @click="saveStepStatus(step)"
                  >
                    保存
                  </el-button>
                </div>
                <div class="status-hint">当前状态：{{ formatStepStatus(step.status) }}</div>
              </div>
            </div>

            <div>项目操作员：{{ detail.operatorUser?.name || '-' }}</div>
            <div>项目检测员：{{ detail.inspectorUser?.name || '-' }}</div>
            <div>工序执行人：{{ step.operatorUser?.name || '-' }}</div>
            <div>最新检测员：{{ step.latestInspectorUser?.name || '-' }}</div>
            <div>状态：{{ formatStepStatus(step.status) }}</div>
            <div>检测报告数量：{{ step.attachments?.length || 0 }}</div>

            <div v-if="step.attachments?.length" class="report-list">
              <div class="report-title">检测报告</div>
              <div v-for="file in step.attachments" :key="file.id" class="report-row">
                <el-link :href="buildAttachmentUrl(file.id)" target="_blank" class="attachment-link">
                  {{ file.fileName }}
                </el-link>
                <div class="report-meta">
                  上传人：{{ file.uploader?.name || '-' }} | 上传时间：{{ formatTime(file.createdAt) }}
                </div>
              </div>
            </div>
            <div v-else class="report-empty">暂无检测报告</div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  buildAttachmentUrl,
  deleteSample,
  getSampleDetail,
  resetSampleOwnership,
  updateSample,
  updateStep,
} from '@/api/sample'

const route = useRoute()
const router = useRouter()
const detail = ref<any>(null)
const sampleStatus = ref('draft')
const savingSampleStatus = ref(false)
const resettingOperator = ref(false)
const resettingInspector = ref(false)
const stepStatusMap = ref<Record<number, string>>({})
const originalStepStatusMap = ref<Record<number, string>>({})
const savingStepIds = ref<number[]>([])

const sampleStatusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
]

const stepStatusOptions = [
  { label: '待开始', value: 'pending' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
]

const progress = computed(() => {
  if (!detail.value?.steps?.length) return 0
  const completed = detail.value.steps.filter((step: any) => step.status === 'completed').length
  return Math.round((completed / detail.value.steps.length) * 100)
})

const projectAttachments = computed(() =>
  Array.isArray(detail.value?.attachments) ? detail.value.attachments.filter((item: any) => !item.sampleStepId) : [],
)

function formatTime(value?: string) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function formatSampleStatus(value?: string) {
  return sampleStatusOptions.find((item) => item.value === value)?.label || value || '-'
}

function formatStepStatus(value?: string) {
  return stepStatusOptions.find((item) => item.value === value)?.label || value || '-'
}

function syncStepStatuses(steps: any[] = []) {
  const nextMap: Record<number, string> = {}
  steps.forEach((step) => {
    nextMap[step.id] = step.status
  })
  stepStatusMap.value = nextMap
  originalStepStatusMap.value = { ...nextMap }
}

function markStepDirty(stepId: number) {
  stepStatusMap.value = {
    ...stepStatusMap.value,
    [stepId]: stepStatusMap.value[stepId],
  }
}

function isStepDirty(stepId: number) {
  return stepStatusMap.value[stepId] !== originalStepStatusMap.value[stepId]
}

async function loadDetail() {
  const { data } = await getSampleDetail(route.params.id as string)
  detail.value = data
  sampleStatus.value = data.status
  syncStepStatuses(Array.isArray(data.steps) ? data.steps : [])
}

async function saveSampleStatus() {
  if (!detail.value || sampleStatus.value === detail.value.status) {
    return
  }

  savingSampleStatus.value = true
  try {
    await updateSample(detail.value.id, { status: sampleStatus.value })
    await loadDetail()
    ElMessage.success(`项目状态已更新为${formatSampleStatus(sampleStatus.value)}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '项目状态保存失败')
  } finally {
    savingSampleStatus.value = false
  }
}

async function saveStepStatus(step: any) {
  const nextStatus = stepStatusMap.value[step.id]
  if (!nextStatus || nextStatus === originalStepStatusMap.value[step.id]) {
    return
  }

  savingStepIds.value = [...savingStepIds.value, step.id]
  try {
    await updateStep(step.id, { status: nextStatus })
    await loadDetail()
    ElMessage.success(`工序状态已更新为${formatStepStatus(nextStatus)}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '工序状态保存失败')
  } finally {
    savingStepIds.value = savingStepIds.value.filter((id) => id !== step.id)
  }
}

async function resetOperatorOwnership() {
  if (!detail.value?.operatorUserId) return

  try {
    await ElMessageBox.confirm(
      '这会清空当前项目操作员，并把进行中的工序退回待开始。确认继续吗？',
      '重置操作员归属',
      { type: 'warning' },
    )
  } catch {
    return
  }

  resettingOperator.value = true
  try {
    await resetSampleOwnership(detail.value.id, { resetOperator: true })
    await loadDetail()
    ElMessage.success('已重置操作员归属，项目可重新认领')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重置操作员归属失败')
  } finally {
    resettingOperator.value = false
  }
}

async function resetInspectorOwnership() {
  if (!detail.value?.inspectorUserId) return

  try {
    await ElMessageBox.confirm(
      '这会清空当前项目检测员，并清除工序上的最新检测员标记。确认继续吗？',
      '重置检测员归属',
      { type: 'warning' },
    )
  } catch {
    return
  }

  resettingInspector.value = true
  try {
    await resetSampleOwnership(detail.value.id, { resetInspector: true })
    await loadDetail()
    ElMessage.success('已重置检测员归属')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重置检测员归属失败')
  } finally {
    resettingInspector.value = false
  }
}

async function removeSample() {
  if (!detail.value) return

  try {
    await ElMessageBox.confirm(
      `确定删除样品 ${detail.value.sampleNo} 吗？该操作会同时删除关联工序和附件。`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await deleteSample(detail.value.id)
    ElMessage.success('样品已删除')
    router.push('/samples')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '删除样品失败')
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.toolbar-actions {
  display: flex;
  gap: 12px;
}

.section-card {
  margin-top: 16px;
}

.attachment-link {
  display: block;
  margin-bottom: 8px;
}

.report-list {
  margin-top: 10px;
}

.report-row + .report-row {
  margin-top: 8px;
}

.report-title {
  margin-bottom: 6px;
  color: #475569;
  font-size: 13px;
}

.report-meta {
  color: #64748b;
  font-size: 12px;
}

.report-empty {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 13px;
}

.status-editor,
.ownership-block {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-status-block {
  align-items: flex-end;
}

.status-select {
  min-width: 140px;
}

.status-hint,
.hint-list {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.hint-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 6px;
}
</style>
