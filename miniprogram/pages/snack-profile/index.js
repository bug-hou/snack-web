const { peekContext, loadContext } = require('../../utils/snack-context');

// 个人主体小程序只保留信息展示，完整功能引导到网站
const WEBSITE = 'https://www.convenience.top';

Page({
  data: {
    hours: '',
    minOrder: '0.00',
    deliveryFee: '0.00',
    isOpen: false,
    website: WEBSITE
  },

  async onShow() {
    const cached = peekContext();
    if (cached) this.applyContext(cached);
    try {
      this.applyContext(await loadContext());
    } catch (error) { /* 沿用缓存中的状态 */ }
  },

  applyContext(context) {
    if (!context) return;
    this.setData({
      isOpen: !!context.isOpen,
      hours: `营业 ${context.businessStart}—${context.businessEnd} · 配送 ${context.deliveryStart}—${context.deliveryEnd}`,
      minOrder: ((context.minOrderCents || 0) / 100).toFixed(2),
      deliveryFee: ((context.deliveryFeeCents || 0) / 100).toFixed(2)
    });
  },

  copyWebsite() {
    wx.setClipboardData({
      data: WEBSITE,
      success() { wx.showToast({ title: '网址已复制，去浏览器打开' }); }
    });
  }
});
