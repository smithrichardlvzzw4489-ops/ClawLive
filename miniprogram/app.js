const { API_BASE } = require("./utils/config.js");

App({
  globalData: {
    /** 与 utils/config.js 中 API_BASE 指向同一后端 */
    apiBase: API_BASE,
  },

  onLaunch() {
    this.globalData.apiBase = API_BASE;
  },
});
