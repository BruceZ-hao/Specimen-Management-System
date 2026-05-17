<template>
  <section class="page-card">
    <div class="toolbar">
      <h2>{{ isEdit ? '编辑样品单' : '新建样品单' }}</h2>
      <el-button @click="router.push('/samples')">返回</el-button>
    </div>

    <el-form :model="form" label-width="110px">
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="样品编号"><el-input v-model="form.sampleNo" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="项目名称"><el-input v-model="form.projectName" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="form.customerName" /></el-form-item></el-col>
        <el-col :span="12">
          <el-form-item label="报告存储路径">
            <el-input v-model="form.reportStoragePath" placeholder="例如 D:\\Reports\\JNRon 或 uploads/reports">
              <template #append>
                <el-button :disabled="!canSelectReportFolder" :loading="selectingReportFolder" @click="selectReportFolder">
                  选择
                </el-button>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="材料"><el-input v-model="form.material" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="压机吨位"><el-input v-model="form.pressTonnage" /></el-form-item></el-col>
        <el-col :span="12">
          <el-form-item label="开始日期">
            <el-date-picker v-model="form.startDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
          </el-form-item>
        </el-col>
        <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" rows="3" /></el-form-item></el-col>
      </el-row>
    </el-form>

    <div class="page-card section-card">
      <div class="toolbar">
        <div>
          <h3>工序配置</h3>
          <div class="section-tip">管理员只维护工序名称、顺序和备注，操作员与检测员在实际处理时自动认领项目并留痕。</div>
        </div>
        <el-button @click="addStep">新增工序</el-button>
      </div>

      <el-table :data="form.steps">
        <el-table-column prop="stepOrder" label="顺序" width="80" />
        <el-table-column label="工序名称">
          <template #default="{ row }">
            <el-input v-model="row.stepName" />
          </template>
        </el-table-column>
        <el-table-column label="备注">
          <template #default="{ row }">
            <el-input v-model="row.remark" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ $index }">
            <el-button link :disabled="$index === 0" @click="moveStep($index, -1)">上移</el-button>
            <el-button link :disabled="$index === form.steps.length - 1" @click="moveStep($index, 1)">下移</el-button>
            <el-button link type="danger" @click="removeStep($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="page-card section-card">
      <div class="toolbar">
        <div>
          <h3>图纸附件</h3>
          <div class="section-tip">图纸属于项目资料；检测报告图片由检测员在工序完成后按工序上传。</div>
        </div>
      </div>

      <div v-if="existingAttachments.length" class="attachment-list">
        <div v-for="file in existingAttachments" :key="file.id" class="attachment-row">
          <a :href="buildFileUrl(file.id)" target="_blank" class="attachment-link">
            {{ file.fileName }}
          </a>
          <el-button link type="danger" @click="removeExistingAttachment(file.id)">删除</el-button>
        </div>
      </div>
      <el-empty v-else description="暂无已上传图纸" />

      <div class="upload-block">
        <input type="file" multiple @change="selectFiles" />
        <div v-if="selectedFiles.length" class="selected-files">
          <div v-for="file in selectedFiles" :key="file.name + file.size">{{ file.name }}</div>
        </div>
      </div>
    </div>

    <div class="footer-actions">
      <el-button @click="router.push('/samples')">取消</el-button>
      <el-button type="primary" @click="submitForm">保存</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { buildAttachmentUrl, createSample, getSampleDetail, updateSample, uploadAttachment } from '@/api/sample'

type EditableStep = {
  id?: number
  stepName: string
  stepOrder: number
  remark: string
}

type AttachmentItem = {
  id: number
  fileName: string
  filePath: string
  sampleStepId?: number | null
}

type WebViewMessage = {
  type?: string
  requestId?: string
  path?: string
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void
        addEventListener: (type: 'message', listener: (event: MessageEvent<WebViewMessage>) => void) => void
        removeEventListener: (type: 'message', listener: (event: MessageEvent<WebViewMessage>) => void) => void
      }
    }
  }
}

const LAST_REPORT_STORAGE_PATH_KEY = 'last-report-storage-path'

const route = useRoute()
const router = useRouter()
const existingAttachments = ref<AttachmentItem[]>([])
const removedAttachmentIds = ref<number[]>([])
const selectedFiles = ref<File[]>([])
const isEdit = computed(() => Boolean(route.params.id))
const canSelectReportFolder = ref(false)
const selectingReportFolder = ref(false)
const folderRequests = new Map<string, (path: string | null) => void>()

const form = reactive({
  sampleNo: '',
  projectName: '',
  reportStoragePath: '',
  customerName: '',
  material: '',
  pressTonnage: '',
  startDate: '',
  remark: '',
  steps: [] as EditableStep[],
})

function buildFileUrl(attachmentId: number) {
  return buildAttachmentUrl(attachmentId)
}

function getWebView() {
  return window.chrome?.webview
}

function handleWebViewMessage(event: MessageEvent<WebViewMessage>) {
  const message = event.data || {}
  if (!message.requestId || !folderRequests.has(message.requestId)) {
    return
  }

  const resolve = folderRequests.get(message.requestId)
  folderRequests.delete(message.requestId)
  if (message.type === 'select-report-folder-result' && message.path) {
    resolve?.(message.path)
    return
  }

  resolve?.(null)
}

function requestReportFolder(initialPath: string) {
  const webview = getWebView()
  if (!webview) {
    return Promise.resolve(null)
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise<string | null>((resolve) => {
    folderRequests.set(requestId, resolve)
    webview.postMessage({
      type: 'select-report-folder',
      requestId,
      initialPath,
    })
  })
}

async function selectReportFolder() {
  if (!canSelectReportFolder.value || selectingReportFolder.value) {
    return
  }

  selectingReportFolder.value = true
  try {
    const selectedPath = await requestReportFolder(form.reportStoragePath.trim())
    if (!selectedPath) {
      return
    }

    form.reportStoragePath = selectedPath
    localStorage.setItem(LAST_REPORT_STORAGE_PATH_KEY, selectedPath)
  } finally {
    selectingReportFolder.value = false
  }
}

function normalizeOrders() {
  form.steps = form.steps.map((step, index) => ({ ...step, stepOrder: index + 1 }))
}

function addStep() {
  form.steps.push({
    stepName: '',
    stepOrder: form.steps.length + 1,
    remark: '',
  })
}

function removeStep(index: number) {
  form.steps.splice(index, 1)
  if (!form.steps.length) {
    addStep()
  }
  normalizeOrders()
}

function moveStep(index: number, delta: number) {
  const target = index + delta
  const current = form.steps[index]
  form.steps[index] = form.steps[target]
  form.steps[target] = current
  normalizeOrders()
}

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFiles.value = Array.from(input.files || [])
}

function removeExistingAttachment(id: number) {
  existingAttachments.value = existingAttachments.value.filter((item) => item.id !== id)
  if (!removedAttachmentIds.value.includes(id)) {
    removedAttachmentIds.value.push(id)
  }
}

async function loadDetail() {
  if (!route.params.id) return
  const { data } = await getSampleDetail(route.params.id as string)
  removedAttachmentIds.value = []
  Object.assign(form, {
    sampleNo: data.sampleNo,
    projectName: data.projectName,
    reportStoragePath: data.reportStoragePath || '',
    customerName: data.customerName,
    material: data.material,
    pressTonnage: data.pressTonnage,
    startDate: data.startDate ? data.startDate.slice(0, 10) : '',
    remark: data.remark || '',
    steps: data.steps.map((step: any) => ({
      id: step.id,
      stepName: step.stepName,
      stepOrder: step.stepOrder,
      remark: step.remark || '',
    })),
  })
  existingAttachments.value = Array.isArray(data.attachments)
    ? data.attachments.filter((item: AttachmentItem) => !item.sampleStepId)
    : []
}

async function submitForm() {
  try {
    if (!form.reportStoragePath.trim()) {
      ElMessage.error('请输入报告存储路径')
      return
    }

    localStorage.setItem(LAST_REPORT_STORAGE_PATH_KEY, form.reportStoragePath.trim())

    const payload = {
      ...form,
      reportStoragePath: form.reportStoragePath.trim(),
      startDate: form.startDate || undefined,
      removeAttachmentIds: removedAttachmentIds.value,
      steps: form.steps.map((step) => ({
        id: step.id,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        remark: step.remark,
      })),
    }

    const response = isEdit.value ? await updateSample(route.params.id as string, payload) : await createSample(payload)
    const sampleId = response.data.id

    for (const file of selectedFiles.value) {
      await uploadAttachment(sampleId, file)
    }

    ElMessage.success('保存成功')
    router.push(`/samples/${sampleId}`)
  } catch {
    ElMessage.error('保存失败，请检查必填项')
  }
}

onMounted(async () => {
  const webview = getWebView()
  canSelectReportFolder.value = !!webview
  webview?.addEventListener('message', handleWebViewMessage)
  if (!form.steps.length) addStep()
  await loadDetail()
  if (!isEdit.value && !form.reportStoragePath.trim()) {
    form.reportStoragePath = localStorage.getItem(LAST_REPORT_STORAGE_PATH_KEY) || ''
  }
})

onBeforeUnmount(() => {
  getWebView()?.removeEventListener('message', handleWebViewMessage)
  folderRequests.forEach((resolve) => resolve(null))
  folderRequests.clear()
})
</script>

<style scoped>
.section-card {
  margin-top: 16px;
}

.section-tip {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.attachment-list {
  display: grid;
  gap: 10px;
}

.attachment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.attachment-link {
  color: #2563eb;
  text-decoration: none;
}

.upload-block {
  margin-top: 16px;
}

.selected-files {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  color: #64748b;
  font-size: 13px;
}

.footer-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
