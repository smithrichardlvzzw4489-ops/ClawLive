/**
 * 小程序请求的后端根地址（需 https，且在微信公众平台配置为 request 合法域名）
 * 本地调试：开发者工具「详情 → 本地设置」勾选「不校验合法域名」
 */
const API_BASE = "https://你的线上域名";

/** VibeKids 接口前缀（与 Next 应用一致时为 /api/vibekids） */
const VK_API_PREFIX = "/api/vibekids";

/** 微信登录换票（需在服务端实现，见仓库说明） */
const MP_LOGIN_PATH = "/api/mp/login";

module.exports = {
  API_BASE,
  VK_API_PREFIX,
  MP_LOGIN_PATH,
};
