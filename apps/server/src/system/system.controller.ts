import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { UserRole } from '@sample/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { AppReleaseItem, SystemService } from './system.service'

type NgrokTunnel = {
  public_url?: string
  proto?: string
}

type NgrokTunnelsResponse = {
  tunnels?: NgrokTunnel[]
}

@Controller('system')
export class SystemController {
  constructor(
    private readonly configService: ConfigService,
    private readonly systemService: SystemService,
  ) {}

  @Get('client-config')
  async getClientConfig(@Query('releaseId') releaseId?: string) {
    const publicBaseUrl = await this.resolvePublicBaseUrl()
    const manualPublicBaseUrl = this.normalizeUrl(await this.systemService.getManualPublicBaseUrl())
    const appScheme = this.configService.get('APP_URL_SCHEME', 'xingyesample')
    const currentRelease = releaseId
      ? await this.systemService.getAppReleaseById(releaseId)
      : await this.systemService.getCurrentAppRelease()
    const detectedApkUrl =
      publicBaseUrl && currentRelease ? this.buildPublicAppDownloadUrl(publicBaseUrl, currentRelease.id) : ''
    const configuredApkUrl = this.normalizeUrl(this.configService.get('APP_DOWNLOAD_URL', ''))
    const appDownloadUrl = detectedApkUrl || configuredApkUrl
    const appLinkUrl = publicBaseUrl
      ? `${publicBaseUrl}/api/system/app-link?base=${encodeURIComponent(publicBaseUrl)}`
      : ''

    return {
      publicBaseUrl,
      manualPublicBaseUrl,
      apiBaseUrl: publicBaseUrl ? `${publicBaseUrl}/api` : '',
      appScheme,
      appLinkUrl,
      appDownloadUrl,
      apkFileName: currentRelease?.fileName || '',
      apkUpdatedAt: currentRelease?.uploadedAt.toISOString() || '',
      apkSizeBytes: currentRelease?.sizeBytes || 0,
      apkVersionName: currentRelease?.versionName || '',
      apkVersionCode: currentRelease?.versionCode || '',
      apkReleaseNotes: currentRelease?.releaseNotes || '',
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('app-releases')
  async getAppReleases() {
    const publicBaseUrl = await this.resolvePublicBaseUrl()
    const releaseState = await this.systemService.getAppReleaseState()

    return {
      mode: releaseState.mode,
      currentReleaseId: releaseState.currentReleaseId,
      items: releaseState.items.map((item) =>
        this.serializeAppRelease(item, releaseState.currentReleaseId, publicBaseUrl),
      ),
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('app-releases/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 512 * 1024 * 1024,
      },
    }),
  )
  async uploadAppRelease(@UploadedFile() file: Express.Multer.File) {
    const release = await this.systemService.uploadAppReleasePackage(file)
    const publicBaseUrl = await this.resolvePublicBaseUrl()

    return this.serializeAppRelease(release, release.id, publicBaseUrl)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('app-releases/:id/activate')
  async activateAppRelease(@Param('id') id: string) {
    const release = await this.systemService.activateAppRelease(id)
    const publicBaseUrl = await this.resolvePublicBaseUrl()

    return this.serializeAppRelease(release, release.id, publicBaseUrl)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('app-releases/:id')
  async deleteAppRelease(@Param('id') id: string) {
    return this.systemService.deleteAppRelease(id)
  }

  @Get('apk-options')
  async getApkOptions() {
    const releaseState = await this.systemService.getAppReleaseState()
    const currentRelease =
      releaseState.items.find((item) => item.id === releaseState.currentReleaseId) || releaseState.items[0] || null

    return {
      items: releaseState.items.map((item) => ({
        name: item.fileName,
        updatedAt: item.uploadedAt.toISOString(),
        isCurrent: item.id === releaseState.currentReleaseId,
      })),
      currentApkName: currentRelease?.fileName || '',
      selectedApkName: currentRelease?.fileName || '',
    }
  }

  @Post('public-base-url')
  async setPublicBaseUrl(@Body('value') value: string) {
    const normalizedValue = this.normalizeUrl(String(value || ''))
    await this.systemService.setManualPublicBaseUrl(normalizedValue)

    return {
      manualPublicBaseUrl: normalizedValue,
      publicBaseUrl: await this.resolvePublicBaseUrl(),
    }
  }

  @Post('apk-selection')
  async setApkSelection(@Body('name') name: string) {
    const releaseState = await this.systemService.getAppReleaseState()
    const normalizedName = String(name || '').trim()
    const matchedRelease = normalizedName
      ? releaseState.items.find((item) => item.fileName === normalizedName)
      : releaseState.items[0]

    if (!matchedRelease) {
      throw new NotFoundException('指定的 APK 文件不存在')
    }

    const currentRelease = await this.systemService.activateAppRelease(matchedRelease.id)

    return {
      currentApkName: currentRelease.fileName || '',
      selectedApkName: currentRelease.fileName || '',
    }
  }

  @Get('app-download')
  async downloadLatestApk(@Query('releaseId') releaseId: string | undefined, @Res() response: Response) {
    const release = releaseId
      ? await this.systemService.getAppReleaseById(releaseId)
      : await this.systemService.getCurrentAppRelease()

    if (!release) {
      throw new NotFoundException('未找到可下载的 APK 文件')
    }

    response.download(release.absolutePath, release.fileName)
  }

  @Get('app-link')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getAppLinkPage(@Query('base') base?: string) {
    const publicBaseUrl = this.normalizeUrl(base || (await this.resolvePublicBaseUrl()))
    const appScheme = this.configService.get('APP_URL_SCHEME', 'xingyesample')
    const currentRelease = await this.systemService.getCurrentAppRelease()
    const appDownloadUrl =
      (publicBaseUrl && currentRelease ? this.buildPublicAppDownloadUrl(publicBaseUrl, currentRelease.id) : '') ||
      this.normalizeUrl(this.configService.get('APP_DOWNLOAD_URL', ''))
    const deepLink = publicBaseUrl
      ? `${appScheme}://server-config?base=${encodeURIComponent(publicBaseUrl)}`
      : `${appScheme}://server-config`
    const safeBaseUrl = this.escapeHtml(publicBaseUrl || '未检测到可用地址')
    const safeDeepLink = this.escapeHtml(deepLink)
    const safeDownloadUrl = this.escapeHtml(appDownloadUrl)
    const downloadButtonHtml = appDownloadUrl
      ? `<a class="button button-secondary" href="${safeDownloadUrl}">下载 APK</a>`
      : ''

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>打开星冶样品系统</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .panel {
      width: min(100%, 420px);
      background: #111827;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35);
    }
    h1 {
      margin: 0;
      font-size: 24px;
      color: #fff;
    }
    p {
      margin: 12px 0 0;
      line-height: 1.7;
      color: #cbd5e1;
      font-size: 14px;
    }
    .url-box,
    .status-box {
      margin-top: 18px;
      padding: 14px;
      border-radius: 14px;
      background: #1e293b;
      color: #93c5fd;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-all;
    }
    .status-box {
      background: #172554;
      color: #dbeafe;
    }
    .actions {
      display: grid;
      gap: 12px;
      margin-top: 20px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      border-radius: 12px;
      text-decoration: none;
      border: 0;
      cursor: pointer;
      font-size: 15px;
      font-weight: 700;
      padding: 0 16px;
    }
    .button-primary {
      background: #2563eb;
      color: #fff;
    }
    .button-secondary {
      background: #e2e8f0;
      color: #0f172a;
    }
    .hint {
      margin-top: 16px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <main class="panel">
    <h1>打开星冶样品系统</h1>
    <p>打开后会把当前服务器地址自动写入 App，然后自动跳到 App 登录页。</p>
    <div class="url-box" id="serverUrl">${safeBaseUrl}</div>
    <div class="status-box" id="statusBox">准备打开 App 并写入服务器地址...</div>
    <div class="actions">
      <a class="button button-primary" href="${safeDeepLink}" id="openAppLink">打开 App 并写入地址</a>
      <button class="button button-secondary" type="button" id="copyAddressButton">复制服务器地址</button>
      ${downloadButtonHtml}
    </div>
    <div class="hint">如果没有自动跳转，请点击“打开 App 并写入地址”。如果还没安装最新版 App，可以点击“下载 APK”。</div>
  </main>
  <script>
    const deepLink = ${JSON.stringify(deepLink)};
    const baseUrl = ${JSON.stringify(publicBaseUrl)};
    const statusBox = document.getElementById('statusBox');
    const copyButton = document.getElementById('copyAddressButton');
    let opened = false;

    function setStatus(text) {
      statusBox.textContent = text;
    }

    function openApp() {
      if (opened) return;
      opened = true;
      setStatus('正在写入服务器地址并跳转到 App 登录页...');
      window.location.href = deepLink;
      setTimeout(() => {
        setStatus('如果 App 已打开，服务器地址已写入成功，请回到 App 登录页继续。');
      }, 1200);
    }

    document.getElementById('openAppLink').addEventListener('click', () => {
      setStatus('正在写入服务器地址并跳转到 App 登录页...');
    });

    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(baseUrl);
        copyButton.textContent = '已复制';
      } catch (error) {
        copyButton.textContent = '复制失败';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        setStatus('已写入成功，正在切换到 App 登录页...');
      }
    });

    setTimeout(openApp, 600);
  </script>
</body>
</html>`
  }

  @Get('app-release-link')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getAppReleaseLinkPage(@Query('id') id?: string) {
    const release = id
      ? await this.systemService.getAppReleaseById(id)
      : await this.systemService.getCurrentAppRelease()

    if (!release) {
      throw new NotFoundException('未找到可下载的移动端更新包。')
    }

    const publicBaseUrl = await this.resolvePublicBaseUrl()
    const downloadUrl = publicBaseUrl
      ? this.buildPublicAppDownloadUrl(publicBaseUrl, release.id)
      : this.buildRelativeAppDownloadUrl(release.id)
    const safeTitle = this.escapeHtml(release.versionName || release.fileName || '移动端更新包')
    const safeFileName = this.escapeHtml(release.fileName || '-')
    const safeVersionCode = this.escapeHtml(release.versionCode || '-')
    const safeUpdatedAt = this.escapeHtml(this.formatDateTime(release.uploadedAt))
    const safeSizeText = this.escapeHtml(this.formatFileSize(release.sizeBytes))
    const safeReleaseNotes = this.escapeHtml(release.releaseNotes || '暂无更新说明').replace(/\r?\n/g, '<br>')
    const safeDownloadUrl = this.escapeHtml(downloadUrl)

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0f172a;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      color: #e2e8f0;
    }
    .panel {
      width: min(100%, 460px);
      background: #111827;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35);
    }
    .eyebrow {
      font-size: 12px;
      color: #93c5fd;
    }
    h1 {
      margin: 10px 0 0;
      font-size: 28px;
      color: #fff;
    }
    p {
      margin: 12px 0 0;
      line-height: 1.7;
      color: #cbd5e1;
      font-size: 14px;
    }
    .meta-grid {
      margin-top: 20px;
      display: grid;
      gap: 12px;
    }
    .meta-item,
    .notes {
      padding: 14px;
      border-radius: 14px;
      background: #1e293b;
    }
    .meta-label {
      font-size: 12px;
      color: #94a3b8;
    }
    .meta-value {
      margin-top: 6px;
      color: #f8fafc;
      line-height: 1.6;
      word-break: break-all;
      font-size: 15px;
    }
    .actions {
      display: grid;
      gap: 12px;
      margin-top: 20px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      border: 0;
      cursor: pointer;
      padding: 0 16px;
    }
    .button-primary {
      background: #2563eb;
      color: #fff;
    }
    .hint {
      margin-top: 16px;
      font-size: 12px;
      line-height: 1.7;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <main class="panel">
    <div class="eyebrow">移动端更新包</div>
    <h1>${safeTitle}</h1>
    <p>下载当前后台选中的 APK 安装包，并按系统提示完成安装。</p>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">文件名</div>
        <div class="meta-value">${safeFileName}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">版本代码</div>
        <div class="meta-value">${safeVersionCode}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">更新时间</div>
        <div class="meta-value">${safeUpdatedAt}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">包大小</div>
        <div class="meta-value">${safeSizeText}</div>
      </div>
      <div class="notes">
        <div class="meta-label">更新说明</div>
        <div class="meta-value">${safeReleaseNotes}</div>
      </div>
    </div>
    <div class="actions">
      <a class="button button-primary" href="${safeDownloadUrl}">下载并安装 APK</a>
    </div>
    <div class="hint">如果你使用的是旧版 App，请先通过后台提供的服务器二维码完成配网，再按应用内更新提示升级。</div>
  </main>
</body>
</html>`
  }

  private async resolvePublicBaseUrl() {
    const manualPublicBaseUrl = this.normalizeUrl(await this.systemService.getManualPublicBaseUrl())

    if (manualPublicBaseUrl) {
      return manualPublicBaseUrl
    }

    return (
      (await this.getNgrokPublicBaseUrl()) ||
      (await this.systemService.getCpolarPublicBaseUrlFromLogs()) ||
      this.normalizeUrl(
        this.configService.get('PUBLIC_BASE_URL') ||
          this.configService.get('NGROK_URL') ||
          this.configService.get('SERVER_PUBLIC_URL') ||
          '',
      )
    )
  }

  private async getNgrokPublicBaseUrl() {
    const apiUrl = this.normalizeUrl(this.configService.get('NGROK_API_URL', 'http://127.0.0.1:4040'))
    const requestUrl = `${apiUrl}/api/tunnels`

    try {
      const response = await fetch(requestUrl)
      if (!response.ok) {
        return ''
      }

      const data = (await response.json()) as NgrokTunnelsResponse
      const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : []
      const preferredTunnel =
        tunnels.find((tunnel) => tunnel.proto === 'https' && tunnel.public_url) ||
        tunnels.find((tunnel) => tunnel.public_url)

      return this.normalizeUrl(preferredTunnel?.public_url || '')
    } catch {
      return ''
    }
  }

  private serializeAppRelease(item: AppReleaseItem, currentReleaseId: string, publicBaseUrl: string) {
    return {
      id: item.id,
      source: item.source,
      fileName: item.fileName,
      versionName: item.versionName,
      versionCode: item.versionCode,
      releaseNotes: item.releaseNotes,
      uploadedAt: item.uploadedAt.toISOString(),
      sizeBytes: item.sizeBytes,
      isCurrent: item.id === currentReleaseId,
      downloadUrl: publicBaseUrl
        ? this.buildPublicAppDownloadUrl(publicBaseUrl, item.id)
        : this.buildRelativeAppDownloadUrl(item.id),
      downloadPageUrl: publicBaseUrl
        ? this.buildPublicAppReleasePageUrl(publicBaseUrl, item.id)
        : this.buildRelativeAppReleasePageUrl(item.id),
    }
  }

  private buildRelativeAppDownloadUrl(releaseId: string) {
    return `/api/system/app-download?releaseId=${encodeURIComponent(releaseId)}`
  }

  private buildPublicAppDownloadUrl(publicBaseUrl: string, releaseId: string) {
    return `${publicBaseUrl}${this.buildRelativeAppDownloadUrl(releaseId)}`
  }

  private buildRelativeAppReleasePageUrl(releaseId: string) {
    return `/api/system/app-release-link?id=${encodeURIComponent(releaseId)}`
  }

  private buildPublicAppReleasePageUrl(publicBaseUrl: string, releaseId: string) {
    return `${publicBaseUrl}${this.buildRelativeAppReleasePageUrl(releaseId)}`
  }

  private normalizeUrl(value: string) {
    return String(value || '')
      .trim()
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '')
  }

  private escapeHtml(value: string) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  private formatDateTime(value: Date) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  private formatFileSize(sizeBytes: number) {
    const size = Number(sizeBytes || 0)
    if (!Number.isFinite(size) || size <= 0) {
      return '-'
    }

    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`
    }
    if (size >= 1024) {
      return `${(size / 1024).toFixed(1)} KB`
    }

    return `${Math.round(size)} B`
  }
}
