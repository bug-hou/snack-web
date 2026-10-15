const { callShop } = require('../../utils/snack-cloud');
const { peekProfile, loadProfile } = require('../../utils/snack-profile');

Page({
  data: { isOwner: false, ordersEnabled: false, isOpen: false,
    hours: '', minOrder: '0.00', deliveryFee: '0.00', ownerId: '', showOwnerId: false,
    avatarUrl: '', initial: '里', displayName: '爱尚里生活', hasProfile: false,
    profileSummary: '还没有设置头像与昵称' },
  applyProfile(profile) {
    const nickName = (profile && profile.nickName) || '';
    const avatarUrl = (profile && profile.avatarUrl) || '';
    this.setData({
      avatarUrl,
      initial: nickName ? nickName.slice(0, 1) : '里',
      displayName: nickName || '爱尚里生活',
      hasProfile: !!(nickName || avatarUrl),
      profileSummary: nickName ? `当前昵称：${nickName}` : '还没有设置头像与昵称'
    });
  },
  async onShow() {
    this.applyProfile(peekProfile());
    try {
      this.applyProfile(await loadProfile());
    } catch (error) { /* 资料拉取失败时沿用缓存 */ }
    try {
      const context = await callShop('getContext');
      this.setData({ isOwner: !!context.isOwner, ordersEnabled: !!context.ordersEnabled,
        isOpen: !!context.isOpen, ownerId: context.ownOpenid || '',
        hours: `营业 ${context.businessStart}—${context.businessEnd} · 配送 ${context.deliveryStart}—${context.deliveryEnd}`,
        minOrder: ((context.minOrderCents || 0) / 100).toFixed(2),
        deliveryFee: ((context.deliveryFeeCents || 0) / 100).toFixed(2) });
    } catch (error) { this.setData({ isOwner: false, ordersEnabled: false, isOpen: false }); }
  },
  toggleOwnerId() { this.setData({ showOwnerId: !this.data.showOwnerId }); },
  copyOwnerId() { if (this.data.ownerId) wx.setClipboardData({ data: this.data.ownerId }); },
  goService(event) {
    const id = event.currentTarget.dataset.id;
    if (!['express', 'purchase', 'secondhand'].includes(id)) return;
    wx.navigateTo({ url: `/pages/community-service/index?type=${encodeURIComponent(id)}` });
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index' }); },
  goProfileEdit() { wx.navigateTo({ url: '/pages/snack-profile-edit/index' }); },
  goShop() {
    wx.switchTab({
      url: '/pages/snack-home/index',
      success() {
        const pages = getCurrentPages();
        const home = pages[pages.length - 1];
        if (home && typeof home.goCatalog === 'function') home.goCatalog();
      }
    });
  },
  goOrders() { wx.navigateTo({ url: '/pages/snack-orders/index' }); },
  goForum() { wx.switchTab({ url: '/pages/community-forum/index' }); }
});
