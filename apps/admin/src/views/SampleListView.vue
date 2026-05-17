<template>
  <section class="page-card">
    <div class="toolbar">
      <div style="display: flex; gap: 12px;">
        <el-input v-model="filters.keyword" placeholder="搜索样品编号/项目/客户" style="width: 260px" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 160px">
          <el-option label="草稿" value="draft" />
          <el-option label="进行中" value="in_progress" />
          <el-option label="已完成" value="completed" />
        </el-select>
        <el-button @click="loadSamples">查询</el-button>
      </div>
      <el-button type="primary" @click="router.push('/samples/new')">新建样品单</el-button>
    </div>

    <el-table :data="rows">
      <el-table-column prop="sampleNo" label="样品编号" />
      <el-table-column prop="projectName" label="项目名称" />
      <el-table-column prop="customerName" label="客户" />
      <el-table-column prop="material" label="材料" />
      <el-table-column label="状态">
        <template #default="{ row }">
          <span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button link @click="router.push(`/samples/${row.id}`)">详情</el-button>
          <el-button link @click="router.push(`/samples/${row.id}/edit`)">编辑</el-button>
          <el-button link type="danger" @click="removeSample(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { deleteSample, getSamples } from '@/api/sample'

const router = useRouter()
const rows = ref<any[]>([])
const filters = reactive({ keyword: '', status: '' })

function statusClass(status: string) {
  return {
    draft: 'status-draft',
    pending: 'status-pending',
    in_progress: 'status-in-progress',
    completed: 'status-completed',
  }[status]
}

async function loadSamples() {
  try {
    const params: Record<string, unknown> = {
      page: 1,
      pageSize: 20,
    }
    if (filters.keyword.trim()) {
      params.keyword = filters.keyword.trim()
    }
    if (filters.status) {
      params.status = filters.status
    }
    const { data } = await getSamples(params)
    rows.value = data.items
  } catch {
    rows.value = []
    ElMessage.error('样品列表加载失败')
  }
}

async function removeSample(row: any) {
  try {
    await ElMessageBox.confirm(
      `确定删除样品 ${row.sampleNo} 吗？该操作会同时删除关联工序和附件。`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await deleteSample(row.id)
    ElMessage.success('样品已删除')
    await loadSamples()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '删除样品失败')
  }
}

onMounted(loadSamples)
</script>
