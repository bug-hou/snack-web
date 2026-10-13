App({
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init({ env: 'cloud1-d9gvn0kkg13217e4e', traceUser: true });
  }
});
