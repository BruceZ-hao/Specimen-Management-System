import { downloadAuthenticatedFile, resolveFileUrl } from './file'

function ensureAppPlus() {
  // #ifndef APP-PLUS
  throw new Error('Share to WeChat is only available in the mobile app.')
  // #endif
}

function getWechatService() {
  ensureAppPlus()

  return new Promise((resolve, reject) => {
    plus.share.getServices(
      (services) => {
        const service = (services || []).find((item) => item && item.id === 'weixin')
        if (!service) {
          reject(new Error('WeChat share is not configured in manifest.'))
          return
        }
        resolve(service)
      },
      (error) => {
        reject(new Error((error && error.message) || 'Failed to get share service.'))
      },
    )
  })
}

function authorizeShareService(service) {
  return new Promise((resolve, reject) => {
    if (service.authenticated) {
      resolve()
      return
    }

    service.authorize(
      () => resolve(),
      (error) => reject(new Error((error && error.message) || 'WeChat auth failed.')),
    )
  })
}

export async function shareImageToWechat({
  imageUrl,
  title = 'inspection-report',
  scene = 'WXSceneSession',
}) {
  ensureAppPlus()
  const service = await getWechatService()
  await authorizeShareService(service)
  const localImagePath = await downloadAuthenticatedFile(resolveFileUrl(imageUrl))

  return new Promise((resolve, reject) => {
    service.send(
      {
        type: 'image',
        pictures: [localImagePath],
        content: title,
        extra: {
          scene,
        },
      },
      () => resolve(localImagePath),
      (error) => reject(new Error((error && error.message) || 'WeChat share failed.')),
    )
  })
}
