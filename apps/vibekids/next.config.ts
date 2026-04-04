import type { NextConfig } from "next";

/** 与 `src/lib/constants.ts` 中 `APP_BASE_PATH` 保持一致 */
const basePath = "/vibekids";

const nextConfig: NextConfig = {
  basePath,
};

export default nextConfig;
