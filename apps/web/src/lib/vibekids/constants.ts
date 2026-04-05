/** 页面与 Link 使用的路径前缀 */
export const VK_BASE = "/vibekids";

/** 合并进主站后的 Route Handlers 前缀 */
export const VK_API_BASE = "/api/vibekids";

/** 主站 JWT（localStorage token），供作品列表/保存/发布等走 PostgreSQL 时使用 */
export function vibekidsBearerHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
