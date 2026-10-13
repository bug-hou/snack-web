function callShop(action, data = {}) {
  if (!wx.cloud) return Promise.reject(new Error('当前微信版本不支持云开发'));
  return wx.cloud.callFunction({ name: 'snackShop', data: { action, data } }).then(response => {
    const result = response.result;
    if (!result || result.ok !== true) throw new Error((result && result.message) || '服务暂不可用');
    return result.data;
  });
}

module.exports = { callShop };
