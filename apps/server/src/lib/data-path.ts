/**
 * 持久化数据目录
 * - 本地开发：apps/server/.data
 * - Railway 等云平台：需设置 PERSISTENT_DATA_PATH 指向 Volume 挂载路径，否则重启/部署后数据会丢失
 */
import * as path from 'path';

const DEFAULT_DATA_DIR = path.join(__dirname, '../../.data');
// Railway 挂载 Volume 后会自动注入 RAILWAY_VOLUME_MOUNT_PATH，可无需再设 PERSISTENT_DATA_PATH
export const DATA_DIR =
  process.env.PERSISTENT_DATA_PATH || process.env.RAILWAY_VOLUME_MOUNT_PATH || DEFAULT_DATA_DIR;

/** 上传文件目录（视频等），与 DATA_DIR 同卷时持久化 */
export const UPLOADS_DIR =
  (process.env.PERSISTENT_DATA_PATH || process.env.RAILWAY_VOLUME_MOUNT_PATH)
    ? path.join(DATA_DIR, 'uploads')
    : path.join(process.cwd(), 'uploads');

if (process.env.PERSISTENT_DATA_PATH || process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.log(`[Data] Using persistent path: ${DATA_DIR}, uploads: ${UPLOADS_DIR}`);
}

export function getDataFilePath(filename: string): string {
  return path.join(DATA_DIR, filename);
}
