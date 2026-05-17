<template>
  <div class="layout-shell">
    <aside class="sidebar">
      <div class="sidebar-scroll">
        <div class="brand-block">
          <div class="brand-mark">JNRon</div>
          <h1>样品管理后台</h1>
          <p>
            {{ authStore.isViewer ? '查看项目进度。' : '项目、工序、账号和系统设置都在这里集中维护。' }}
          </p>
        </div>

        <nav class="nav-list">
          <router-link v-if="authStore.isViewer" to="/progress">项目进度</router-link>
          <template v-else>
            <router-link to="/samples">样品管理</router-link>
            <router-link v-if="authStore.isAdmin" to="/users">账号管理</router-link>
            <router-link v-if="authStore.isAdmin" to="/settings">设置</router-link>
          </template>
        </nav>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-user">
          <div class="sidebar-user-label">当前账号</div>
          <div class="sidebar-user-name">{{ authStore.user?.name || '用户' }}</div>
          <div class="sidebar-user-role">{{ currentUserRoleText }}</div>
          <el-button text class="logout-button" @click="logout">退出登录</el-button>
        </div>
      </div>
    </aside>

    <main class="content">
      <div class="content-scroll">
        <header class="content-header">
          <div>
            <div class="content-title">{{ pageTitle }}</div>
            <div class="content-subtitle">{{ pageSubtitle }}</div>
          </div>
        </header>

        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const pageTitle = computed(() => {
  const title = route.meta?.title
  if (typeof title === 'string' && title.trim()) {
    return title
  }
  return authStore.isViewer ? '项目进度' : '样品管理'
})

const pageSubtitle = computed(() => {
  const subtitle = route.meta?.subtitle
  if (typeof subtitle === 'string' && subtitle.trim()) {
    return subtitle
  }
  return authStore.isViewer ? '只读账号仅可查看项目摘要进度。' : '项目、工序、图纸和检测报告都在这里查看。'
})

const currentUserRoleText = computed(() => {
  if (!authStore.user) {
    return '未登录'
  }
  return roleText(String(authStore.user.role || ''))
})

function roleText(role?: string) {
  switch (role) {
    case 'admin':
      return '管理员'
    case 'operator':
      return '操作员'
    case 'inspector':
      return '检测员'
    case 'viewer':
      return '只读查看'
    default:
      return '未识别角色'
  }
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  background: #eef2f7;
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  overflow: hidden;
  background: #0f172a;
  color: #fff;
  border-right: 1px solid rgba(148, 163, 184, 0.14);
}

.sidebar-scroll,
.content-scroll {
  height: 100%;
  overflow-y: auto;
}

.sidebar-scroll {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px;
}

.brand-block h1 {
  margin: 10px 0 0;
  font-size: 26px;
  line-height: 1.2;
}

.brand-block p {
  margin: 12px 0 0;
  color: #cbd5e1;
  line-height: 1.7;
  font-size: 14px;
}

.brand-mark {
  font-size: 13px;
  font-weight: 700;
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.nav-list {
  display: grid;
  gap: 10px;
}

.nav-list a {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 8px;
  color: #cbd5e1;
  text-decoration: none;
  font-size: 16px;
  transition: background 0.2s ease, color 0.2s ease;
}

.nav-list a:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.nav-list a.router-link-active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-user {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar-user-label {
  font-size: 12px;
  color: #94a3b8;
}

.sidebar-user-name {
  font-size: 18px;
  font-weight: 700;
}

.sidebar-user-role {
  color: #cbd5e1;
  font-size: 14px;
}

.logout-button {
  justify-self: start;
  padding-left: 0;
  color: #93c5fd;
}

.content {
  min-height: 100vh;
  overflow: hidden;
}

.content-scroll {
  height: 100vh;
  padding: 24px 28px;
}

.content-header {
  margin-bottom: 18px;
}

.content-title {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.content-subtitle {
  margin-top: 6px;
  color: #64748b;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .layout-shell {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .content {
    position: static;
    height: auto;
    min-height: 0;
  }

  .sidebar-scroll,
  .content-scroll {
    height: auto;
    overflow: visible;
  }
}
</style>
