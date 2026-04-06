const { getToken } = require("../../utils/auth.js");
const { API_BASE } = require("../../utils/config.js");

Page({
  data: {
    src: "",
  },

  onShow() {
    const token = getToken();
    const src = token
      ? `${API_BASE}/vibekids/mp-bridge?t=${encodeURIComponent(token)}`
      : `${API_BASE}/vibekids`;
    this.setData({ src });
  },
});
