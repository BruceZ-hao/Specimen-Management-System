<script>
import { getAccessToken } from './utils/auth'
import { maybePromptForAppUpdate } from './utils/app-update'
import { extractBaseUrlFromScanResult, setServerBaseUrl, supportsDynamicServerConfig } from './utils/config'

function extractLaunchArgument() {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.arguments) {
    return String(plus.runtime.arguments || '')
  }
  // #endif
  return ''
}

function applyServerConfigFromArgument(argument) {
  if (!supportsDynamicServerConfig()) {
    return false
  }

  const base = extractBaseUrlFromScanResult(argument)
  if (!base) {
    return false
  }

  setServerBaseUrl(base)
  uni.showToast({ title: '服务器地址已写入', icon: 'success' })
  uni.reLaunch({ url: '/pages/login/index' })
  return true
}

async function routeAfterLaunch() {
  const token = getAccessToken()
  if (!token) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }

  const updateResult = await maybePromptForAppUpdate()
  if (updateResult?.action === 'download' && updateResult.updatePageUrl) {
    uni.reLaunch({ url: updateResult.updatePageUrl })
    return
  }

  uni.reLaunch({ url: '/pages/tasks/index' })
}

export default {
  onLaunch() {
    const handled = applyServerConfigFromArgument(extractLaunchArgument())
    if (handled) {
      return
    }

    routeAfterLaunch()
  },
  onShow() {
    applyServerConfigFromArgument(extractLaunchArgument())
  },
}
</script>

<style>
page {
  background: #eef2f7;
  font-family: Arial, "Microsoft YaHei", sans-serif;
  color: #0f172a;
}

:root {
  --bg-page: #eef2f7;
  --bg-card: #ffffff;
  --bg-soft: #f8fafc;
  --bg-dark: #0f172a;
  --bg-dark-soft: #1e293b;
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --success: #16a34a;
  --success-soft: #dcfce7;
  --warning: #f59e0b;
  --warning-soft: #fef3c7;
  --pending: #64748b;
  --pending-soft: #e2e8f0;
  --text-main: #0f172a;
  --text-sub: #64748b;
  --text-muted: #94a3b8;
  --border-light: #e2e8f0;
  --shadow-card: 0 10rpx 32rpx rgba(15, 23, 42, 0.06);
  --radius-xl: 28rpx;
  --radius-lg: 22rpx;
  --radius-md: 18rpx;
}

.app-card {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}

.icon-badge {
  width: 60rpx;
  height: 60rpx;
  line-height: 60rpx;
  text-align: center;
  border-radius: 18rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.progress-track {
  width: 100%;
  height: 12rpx;
  border-radius: 999rpx;
  overflow: hidden;
  background: #e2e8f0;
}

.progress-bar {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
}

.status-chip {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
}

.status-chip.pending {
  background: var(--pending-soft);
  color: var(--pending);
}

.status-chip.progress {
  background: #dbeafe;
  color: var(--primary-dark);
}

.status-chip.completed {
  background: var(--success-soft);
  color: var(--success);
}
</style>
