import os from "os";
import path from "path";

/**
 * VibeKids JSON 存储根目录。
 * Vercel Serverless 下 `process.cwd()` 位于只读包内（写 credits.json 会 EROFS）；
 * 默认改用 `os.tmpdir()` 下子目录，数据在冷启动间不保证持久，但生成接口可正常工作。
 * 长期持久化请设 `VIBEKIDS_DATA_DIR` 指向挂载卷；多实例请设 Upstash（`VIBEKIDS_UPSTASH_REDIS_REST_*`），作品列表会走 Redis 而非本文件。
 */
export function getVibekidsDataDir(): string {
  const override = process.env.VIBEKIDS_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "clawlive-vibekids");
  }
  return path.join(process.cwd(), "data", "vibekids");
}
