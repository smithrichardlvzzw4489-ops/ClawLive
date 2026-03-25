import type { Area } from 'react-easy-crop';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (e) => reject(e));
    if (!url.startsWith('blob:')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });
}

/** 与首页 FeedPostCard 作品区一致：3:4；输出宽度上限减轻请求体积 */
const MAX_OUTPUT_WIDTH = 1080;

/**
 * 将裁剪区域绘制成 JPEG data URL（与 react-easy-crop 官方示例一致，并限制最大宽度）
 */
export async function getCroppedImageDataUrl(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  let outW = pixelCrop.width;
  let outH = pixelCrop.height;
  if (outW > MAX_OUTPUT_WIDTH) {
    const r = MAX_OUTPUT_WIDTH / outW;
    outW = MAX_OUTPUT_WIDTH;
    outH = Math.round(outH * r);
  }

  canvas.width = outW;
  canvas.height = outH;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

/** 首页信息流作品卡片封面区域：宽:高 = 3:4 */
export const FEED_POST_COVER_ASPECT = 3 / 4;
