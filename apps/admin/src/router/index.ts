import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'
import MainLayout from '@/views/MainLayout.vue'
import SampleListView from '@/views/SampleListView.vue'
import SampleFormView from '@/views/SampleFormView.vue'
import SampleDetailView from '@/views/SampleDetailView.vue'
import UserListView from '@/views/UserListView.vue'
import ViewerProgressView from '@/views/ViewerProgressView.vue'
import SettingsView from '@/views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', redirect: '/samples' },
        {
          path: '/samples',
          component: SampleListView,
          meta: {
            title: '样品管理',
            subtitle: '项目、工序、图纸和检测报告都在这里查看。',
          },
        },
        {
          path: '/samples/new',
          component: SampleFormView,
          meta: {
            title: '新建样品单',
            subtitle: '填写项目基础信息、工序顺序和图纸资料。',
          },
        },
        {
          path: '/samples/:id/edit',
          component: SampleFormView,
          meta: {
            title: '编辑样品单',
            subtitle: '调整项目资料、报告存储路径和工序配置。',
          },
        },
        {
          path: '/samples/:id',
          component: SampleDetailView,
          meta: {
            title: '样品详情',
            subtitle: '查看项目进度、工序状态、附件和归属信息。',
          },
        },
        {
          path: '/users',
          component: UserListView,
          meta: {
            title: '账号管理',
            subtitle: '管理员可以直接维护账号、角色和登录状态。',
          },
        },
        {
          path: '/settings',
          component: SettingsView,
          meta: {
            title: '设置',
            subtitle: '集中维护服务器配置、更新包和移动端分发。',
          },
        },
        {
          path: '/progress',
          component: ViewerProgressView,
          meta: {
            title: '项目进度',
            subtitle: '只读账号仅可查看项目摘要进度。',
          },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const adminOnlyPaths = ['/users', '/samples/new', '/settings']

  if (to.path !== '/login' && !authStore.token) {
    return '/login'
  }
  if (to.path === '/login' && authStore.token) {
    if (!authStore.user) {
      await authStore.refreshUser().catch(() => authStore.logout())
    }
    if (!authStore.token) {
      return '/login'
    }
    return authStore.isViewer ? '/progress' : '/samples'
  }
  if (authStore.token && !authStore.user) {
    await authStore.refreshUser().catch(() => authStore.logout())
    if (!authStore.token) {
      return '/login'
    }
  }
  if (authStore.isViewer && to.path !== '/progress') {
    return '/progress'
  }
  if (!authStore.isViewer && to.path === '/progress') {
    return '/samples'
  }
  if (!authStore.isAdmin && (adminOnlyPaths.includes(to.path) || /^\/samples\/\d+\/edit$/.test(to.path))) {
    return '/samples'
  }
  return true
})

export default router
