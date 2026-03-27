/**
 * 客户端图片压缩工具
 * 在上传前用 Canvas 缩放 + 转 JPEG，把大图压到合理尺寸，
 * 减少 base64 payload，大幅提升上传速度。
 */

export interface CompressOptions {
  /** 最大宽度（px），默认 1920 */
  maxWidth?: number;
  /** 最大高度（px），默认 1920 */
  maxHeight?: number;
  /** JPEG 质量 0~1，默认 0.82 */
  quality?: number;
  /**
   * 原始文件小于此字节数时跳过压缩，直接返回原始 DataURL。
   * 默认 150 KB（GIF / 已是小图时不必压缩）。
   */
  skipIfSmallerThan?: number;
}

/**
 * 将 File 压缩后返回 DataURL。
 * - PNG/JPEG/WEBP → 输出 JPEG
 * - GIF 文件（动图）不压缩，直接读取原始 DataURL
 * - 图片已足够小时直接返回原始 DataURL
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<string> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    skipIfSmallerThan = 150 * 1024,
  } = opts;

  // GIF 不压缩（避免动图变静图）
  if (file.type === 'image/gif') {
    return readRaw(file);
  }

  // 已足够小，跳过压缩
  if (file.size <= skipIfSmallerThan) {
    return readRaw(file);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // 等比缩放到 maxWidth × maxHeight 范围内
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // canvas 不可用时回退到原始读取
        readRaw(file).then(resolve).catch(reject);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // 图片解码失败时回退到原始读取
      readRaw(file).then(resolve).catch(reject);
    };

    img.src = objectUrl;
  });
}

function readRaw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}
