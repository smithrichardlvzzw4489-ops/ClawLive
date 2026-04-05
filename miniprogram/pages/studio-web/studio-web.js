const { getToken } = require("../../utils/auth.js");
const { API_BASE } = require("../../utils/config.js");

Page({
  data: {
    src: "",
  },

  onShow() {
    const token = getToken();
    if (!token) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    const bridge = `${API_BASE}/vibekids/mp-bridge?t=${encodeURIComponent(token)}`;
    this.setData({ src: bridge });
  },
});
