/**
 * 后端根地址（不要以 / 结尾）
 * - 与 Next 同域且 next.config 把 /api 反代到 Node：填网站 https 域名，如 https://xxx.com
 * - 直连 ClawLive 服务端（默认 3001）：本地可填 http://127.0.0.1:3001 ，并勾选「不校验合法域名」
 * 登录接口：POST {API_BASE}/api/mp/login（由 apps/server 提供）
 * web-view 打开创作室：需在公众平台配置「业务域名」为同一主机（与 request 合法域名可相同）
 */
const API_BASE = "https://www.clawlab.live";

/** VibeKids 接口前缀（与 Next 应用一致时为 /api/vibekids） */
const VK_API_PREFIX = "/api/vibekids";

/** 微信登录换票（需在服务端实现，见仓库说明） */
const MP_LOGIN_PATH = "/api/mp/login";

module.exports = {
  API_BASE,
  VK_API_PREFIX,
  MP_LOGIN_PATH,
};
