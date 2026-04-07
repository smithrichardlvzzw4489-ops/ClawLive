const { getToken, setToken } = require("../../utils/auth.js");
const { API_BASE, MP_LOGIN_PATH } = require("../../utils/config.js");

Page({
  data: {
    src: "",
  },

  onShow() {
    const token = getToken();
    if (token) {
      this._loadWebView(token);
      return;
    }
    this._silentLogin();
  },

  _loadWebView(token) {
    const src = `${API_BASE}/vibekids/mp-bridge?t=${encodeURIComponent(token)}`;
    this.setData({ src });
  },

  _silentLogin() {
    wx.login({
      timeout: 10000,
      success: (loginRes) => {
        if (!loginRes.code) {
          this._loadWebView("");
          return;
        }
        wx.request({
          url: `${API_BASE}${MP_LOGIN_PATH}`,
          method: "POST",
          header: { "Content-Type": "application/json" },
          data: { code: loginRes.code },
          timeout: 20000,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
              setToken(res.data.token);
              this._loadWebView(res.data.token);
            } else {
              this._loadWebView("");
            }
          },
          fail: () => {
            this._loadWebView("");
          },
        });
      },
      fail: () => {
        this._loadWebView("");
      },
    });
  },
});
