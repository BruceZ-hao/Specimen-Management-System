<template>
  <section class="page-card">
    <div class="toolbar">
      <h2>项目进度</h2>
      <el-button @click="loadRows">刷新</el-button>
    </div>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="sampleNo" label="样品编号" min-width="160" />
      <el-table-column prop="projectName" label="项目名" min-width="220" />
      <el-table-column label="项目状态" width="140">
        <template #default="{ row }">
          <span class="status-pill" :class="statusClass(row.status)">
            {{ statusText(row.status) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="完成百分比" width="220">
        <template #default="{ row }">
          <div class="progress-cell">
            <el-progress :percentage="row.progress" :stroke-width="10" />
          </div>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getProgressSummary } from '@/api/sample'

type ProgressRow = {
  id: number
  sampleNo: string
  projectName: string
  status: string
  progress: number
}

const rows = ref<ProgressRow[]>([])
const loading = ref(false)

function statusText(status: string) {
  return (
    {
      draft: '草稿',
      in_progress: '进行中',
      completed: '已完成',
    }[status] || status || '-'
  )
}

function statusClass(status: string) {
  return {
    draft: 'status-draft',
    pending: 'status-pending',
    in_progress: 'status-in-progress',
    completed: 'status-completed',
  }[status]
}

async function loadRows() {
  loading.value = true
  try {
    const { data } = await getProgressSummary()
    rows.value = Array.isArray(data) ? data : []
  } catch {
    rows.value = []
    ElMessage.error('项目进度加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadRows)
</script>

<style scoped>
.progress-cell {
  min-width: 180px;
}
</style>
