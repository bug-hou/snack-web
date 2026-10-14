const { services } = require('../../utils/snack-community');

Page({
  data: { services, service: services[0] },
  onLoad(options) { this.setService(options.type); },
  setService(id) {
    const service = services.find(item => item.id === id) || services[0];
    this.setData({ service });
    wx.setNavigationBarTitle({ title: service.title });
  },
  selectService(event) { this.setService(event.currentTarget.dataset.id); },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index' }); },
  goHome() { wx.switchTab({ url: '/pages/snack-home/index' }); },
  goCatalog() {
    wx.switchTab({
      url: '/pages/snack-home/index',
      success() {
        const pages = getCurrentPages();
        const home = pages[pages.length - 1];
        if (home && typeof home.goCatalog === 'function') home.goCatalog();
      }
    });
  },
  showSharingGuide() {
    wx.showModal({
      title: '物品发布须知',
      content: '分享区尚未开放发布。开放后请上传实物照片、如实说明成色和瑕疵，选择二手转让或免费分享；不要公开手机号和完整门牌号，建议在小区公共区域当面交接。',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#34765B'
    });
  }
});
