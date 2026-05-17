<template>
  <div class="login-page">
    <div class="login-card page-card">
      <div class="brand">JNRon</div>
      <h1>Sample Manager</h1>
      <p class="login-subtitle">
        管理员发布样品流程与图纸，操作员和检测员在移动端执行工序。
      </p>

      <el-form :model="form" @submit.prevent="handleSubmit">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-button type="primary" class="submit-button" @click="handleSubmit">登录</el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const form = reactive({ username: '', password: '' })

async function handleSubmit() {
  try {
    const { data } = await login(form)
    authStore.setSession(data.accessToken, data.user)
    router.push(data.user?.role === 'viewer' ? '/progress' : '/samples')
  } catch {
    ElMessage.error('登录失败，请检查账号或密码')
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 28%),
    #f4f6f8;
}

.login-card {
  width: min(100%, 420px);
}

.brand {
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 10px 0 0;
  font-size: 32px;
}

.login-subtitle {
  margin: 10px 0 24px;
  color: #64748b;
  line-height: 1.6;
}

.submit-button {
  width: 100%;
}
</style>
