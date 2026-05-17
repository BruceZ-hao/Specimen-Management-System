<template>
  <section class="page-card">
    <div class="toolbar">
      <h2>账号管理</h2>
    </div>

    <el-form :inline="true" :model="form" class="user-form" @submit.prevent="create">
      <el-form-item label="账号">
        <el-input v-model="form.username" placeholder="请输入账号" />
      </el-form-item>
      <el-form-item label="姓名">
        <el-input v-model="form.name" placeholder="请输入姓名" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
      </el-form-item>
      <el-form-item label="角色">
        <el-select v-model="form.role" style="width: 150px">
          <el-option
            v-for="item in roleOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="form.phone" placeholder="选填" />
      </el-form-item>
      <el-button type="primary" @click="create">新增账号</el-button>
    </el-form>

    <el-table :data="rows">
      <el-table-column prop="username" label="账号" min-width="140" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column label="角色" min-width="240">
        <template #default="{ row }">
          <div class="role-cell">
            <el-select v-model="roleDrafts[row.id]" size="small" style="width: 130px">
              <el-option
                v-for="item in roleOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-button
              link
              type="primary"
              :loading="roleSavingUserId === row.id"
              :disabled="roleDrafts[row.id] === row.role"
              @click="saveRowRole(row)"
            >
              保存角色
            </el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" min-width="140" />
      <el-table-column label="状态" min-width="100">
        <template #default="{ row }">
          {{ statusText(row.status) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button link @click="openPassword(row)">重置密码</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editVisible" title="编辑账号" width="520px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="账号">
          <el-input v-model="editForm.username" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.role" style="width: 100%">
            <el-option
              v-for="item in roleOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="editForm.phone" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="重置密码" width="460px">
      <el-form :model="passwordForm" label-width="90px">
        <el-form-item label="账号">
          <el-input :model-value="passwordForm.username" disabled />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" @click="savePassword">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { createUser, deleteUser, getUsers, updateUser } from '@/api/user'
import { useAuthStore } from '@/stores/auth'

type UserRow = {
  id: number
  username: string
  name: string
  role: string
  phone?: string | null
  status: string
}

const roleOptions = [
  { label: '管理员', value: 'admin' },
  { label: '操作员', value: 'operator' },
  { label: '检测员', value: 'inspector' },
  { label: '只读查看', value: 'viewer' },
]

const router = useRouter()
const authStore = useAuthStore()
const rows = ref<UserRow[]>([])
const roleDrafts = reactive<Record<number, string>>({})
const roleSavingUserId = ref<number | null>(null)

const form = reactive({
  username: '',
  name: '',
  password: '',
  role: 'operator',
  phone: '',
})

const editVisible = ref(false)
const passwordVisible = ref(false)
const editingUserId = ref<number | null>(null)
const passwordUserId = ref<number | null>(null)

const editForm = reactive({
  username: '',
  name: '',
  role: 'operator',
  phone: '',
  status: 'active',
})

const passwordForm = reactive({
  username: '',
  password: '',
})

function syncRoleDrafts(list: UserRow[]) {
  const activeIds = new Set<number>()
  for (const row of list) {
    activeIds.add(row.id)
    roleDrafts[row.id] = row.role
  }
  for (const key of Object.keys(roleDrafts)) {
    const userId = Number(key)
    if (!activeIds.has(userId)) {
      delete roleDrafts[userId]
    }
  }
}

function statusText(status: string) {
  return status === 'active' ? '启用' : status === 'disabled' ? '停用' : status || '-'
}

function extractErrorMessage(error: any) {
  const data = error?.response?.data
  if (Array.isArray(data?.message) && data.message.length) {
    return data.message.join('，')
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }
  return '操作失败'
}

async function loadUsers() {
  const { data } = await getUsers()
  rows.value = data
  syncRoleDrafts(data)
}

async function create() {
  try {
    await createUser(form)
    ElMessage.success('账号创建成功')
    Object.assign(form, { username: '', name: '', password: '', role: 'operator', phone: '' })
    await loadUsers()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error))
  }
}

function openEdit(row: UserRow) {
  editingUserId.value = row.id
  Object.assign(editForm, {
    username: row.username,
    name: row.name,
    role: row.role,
    phone: row.phone || '',
    status: row.status || 'active',
  })
  editVisible.value = true
}

function openPassword(row: UserRow) {
  passwordUserId.value = row.id
  Object.assign(passwordForm, {
    username: row.username,
    password: '',
  })
  passwordVisible.value = true
}

async function saveRowRole(row: UserRow) {
  const nextRole = roleDrafts[row.id]
  if (!nextRole || nextRole === row.role) {
    return
  }

  roleSavingUserId.value = row.id
  try {
    const { data } = await updateUser(row.id, { role: nextRole })
    row.role = data.role
    roleDrafts[row.id] = data.role
    ElMessage.success('账号角色已更新')

    if (Number(authStore.user?.id) === row.id) {
      await authStore.refreshUser()
      if (!authStore.isAdmin) {
        router.push(authStore.isViewer ? '/progress' : '/samples')
      }
    }
  } catch (error) {
    roleDrafts[row.id] = row.role
    ElMessage.error(extractErrorMessage(error))
  } finally {
    roleSavingUserId.value = null
  }
}

async function saveEdit() {
  if (!editingUserId.value) return
  try {
    const { data } = await updateUser(editingUserId.value, {
      username: editForm.username,
      name: editForm.name,
      role: editForm.role,
      phone: editForm.phone,
      status: editForm.status,
    })
    ElMessage.success('账号已更新')
    editVisible.value = false
    if (Number(authStore.user?.id) === editingUserId.value) {
      await authStore.refreshUser()
      if (!authStore.isAdmin) {
        router.push(authStore.isViewer ? '/progress' : '/samples')
      }
    }
    await loadUsers()
    roleDrafts[data.id] = data.role
  } catch (error) {
    ElMessage.error(extractErrorMessage(error))
  }
}

async function savePassword() {
  if (!passwordUserId.value) return
  try {
    await updateUser(passwordUserId.value, {
      password: passwordForm.password,
    })
    ElMessage.success('密码已重置')
    passwordVisible.value = false
  } catch (error) {
    ElMessage.error(extractErrorMessage(error))
  }
}

async function remove(row: UserRow) {
  try {
    await ElMessageBox.confirm(`确定删除账号“${row.username}”吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteUser(row.id)
    ElMessage.success('账号已删除')
    await loadUsers()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close' || error?.code === 'cancel') {
      return
    }
    ElMessage.error(extractErrorMessage(error))
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.user-form {
  margin-bottom: 16px;
}

.role-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
