const { getToken } = require("./utils/auth.js");

App({
  globalData: {
    /** 与 utils/config.js 中 API_BASE 指向同一后端 */
    apiBase: "",
  },

  onLaunch() {
    const { API_BASE } = require("./utils/config.js");
    this.globalData.apiBase = API_BASE;
  },

  onShow() {
    getToken();
  },
});
