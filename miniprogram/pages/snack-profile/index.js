const { callShop } = require('../../utils/snack-cloud');

Page({
  data: { isOwner: false, ordersEnabled: false, isOpen: false,
    hours: '', minOrder: '0.00', deliveryFee: '0.00', ownerId: '', showOwnerId: false },
  async onShow() {
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
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index' }); },
  goShop() { wx.switchTab({ url: '/pages/snack-home/index' }); },
  goOrders() { wx.switchTab({ url: '/pages/snack-orders/index' }); }
});
