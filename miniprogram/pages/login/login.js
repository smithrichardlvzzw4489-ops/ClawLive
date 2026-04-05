const { API_BASE, MP_LOGIN_PATH } = require("../../utils/config.js");
const { setToken } = require("../../utils/auth.js");

Page({
  data: {
    loading: false,
    err: "",
  },

  doLogin() {
    this.setData({ err: "", loading: true });
    wx.login({
      timeout: 10000,
      success: (loginRes) => {
        if (!loginRes.code) {
          this.setData({ loading: false, err: "未获取到 code，请重试" });
          return;
        }
        wx.request({
          url: `${API_BASE}${MP_LOGIN_PATH}`,
          method: "POST",
          header: { "Content-Type": "application/json" },
          data: { code: loginRes.code },
          timeout: 20000,
          success: (res) => {
            this.setData({ loading: false });
            if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
              setToken(res.data.token);
              wx.showToast({ title: "登录成功", icon: "success" });
              setTimeout(() => wx.navigateBack(), 800);
              return;
            }
            const d = res.data || {};
            const msg =
              d.message ?
                `${d.error || "错误"}：${d.message}`
              : d.error || `HTTP ${res.statusCode}`;
            this.setData({ err: String(msg) });
          },
          fail: () => {
            this.setData({
              loading: false,
              err: "网络失败：请配置 API_BASE、服务端 /api/mp/login，或开启不校验域名。",
            });
          },
        });
      },
      fail: () => {
        this.setData({ loading: false, err: "wx.login 失败" });
      },
    });
  },
});
