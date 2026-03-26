/**
 * 直播相关功能总开关（仅隐藏 UI 与入口，不删业务代码）。
 * 默认隐藏；在 Vercel 设置 NEXT_PUBLIC_SHOW_LIVE_FEATURES=true 并重新部署即可恢复展示。
 */
export const SHOW_LIVE_FEATURES =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SHOW_LIVE_FEATURES === 'true';
