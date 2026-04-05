const TOKEN_KEY = "clawlive_mp_token";

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  if (!token) return;
  try {
    wx.setStorageSync(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

function clearToken() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

module.exports = {
  TOKEN_KEY,
  getToken,
  setToken,
  clearToken,
};
