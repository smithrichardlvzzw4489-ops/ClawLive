const { getToken, clearToken } = require("../../utils/auth.js");
const { vibekids } = require("../../utils/request.js");

Page({
  data: {
    loggedIn: false,
    hint: "",
  },

  onShow() {
    const token = getToken();
    if (token) {
      wx.redirectTo({ url: "/pages/studio-web/studio-web" });
      return;
    }
    this.setData({ loggedIn: false, hint: "" });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  logout() {
    clearToken();
    this.setData({ loggedIn: false, hint: "" });
    wx.showToast({ title: "已退出", icon: "none" });
  },

  async tryLoadWorks() {
    this.setData({ hint: "" });
    wx.showLoading({ title: "加载中" });
    try {
      const res = await vibekids("/works?mine=1", { method: "GET" });
      wx.hideLoading();
      if (res.statusCode === 401) {
        this.setData({ hint: "请先登录后再查看「我的作品」。" });
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        const n = (res.data && res.data.works && res.data.works.length) || 0;
        this.setData({ hint: `接口正常，当前 ${n} 条作品。` });
      } else {
        this.setData({
          hint: `请求失败 HTTP ${res.statusCode}：${JSON.stringify(res.data).slice(0, 200)}`,
        });
      }
    } catch (e) {
      wx.hideLoading();
      this.setData({ hint: "网络错误：请检查 API_BASE、合法域名或本地「不校验域名」。" });
    }
  },
});
