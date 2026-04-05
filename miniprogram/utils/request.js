const { API_BASE, VK_API_PREFIX } = require("./config.js");
const { getToken } = require("./auth.js");

/**
 * @param {string} path 以 / 开头，如 /api/vibekids/works
 * @param {WechatMiniprogram.RequestOption} opts
 */
function request(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const header = {
    "Content-Type": "application/json",
    ...(opts.header || {}),
  };
  const token = getToken();
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: opts.method || "GET",
      data: opts.data,
      header,
      timeout: opts.timeout || 60000,
      success(res) {
        resolve(res);
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

/** GET /api/vibekids/... */
function vibekids(path, opts) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return request(`${VK_API_PREFIX}${p}`, opts);
}

module.exports = {
  request,
  vibekids,
};
