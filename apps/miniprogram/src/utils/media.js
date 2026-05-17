import { runWithNativePermission } from './native-permission'

function chooseImage(sourceType) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sourceType,
      sizeType: ['compressed', 'original'],
      success: resolve,
      fail: reject,
    })
  })
}

function chooseImageSource() {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        resolve(res.tapIndex === 0 ? 'camera' : 'album')
      },
      fail: () => resolve('cancelled'),
    })
  })
}

export async function chooseReportImage() {
  const source = await chooseImageSource()
  if (source === 'cancelled') {
    return { ok: false, reason: 'cancelled' }
  }

  return runWithNativePermission(source, () => chooseImage([source]))
}

export function getChosenImagePath(result) {
  const image = result && result.result ? result.result : result
  return image && image.tempFilePaths && image.tempFilePaths[0] ? image.tempFilePaths[0] : ''
}
