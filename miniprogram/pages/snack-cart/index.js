const cart = require('../../utils/snack-cart');
const { loadProducts } = require('../../utils/snack-catalog');
const { callShop } = require('../../utils/snack-cloud');

Page({
  data: { items: [], count: 0, total: '0.00', catalogError: '', deliveryFee: '0.00',
    payable: '0.00', minOrder: '0.00', belowMinimum: false, settingsReady: false },
  async onShow() {
    this.setData({ settingsReady: false });
    try {
      const [_, config] = await Promise.all([loadProducts(), callShop('getContext')]);
      this._feeCents = Number.isSafeInteger(config.deliveryFeeCents) ? config.deliveryFeeCents : 0;
      this._minCents = Number.isSafeInteger(config.minOrderCents) ? config.minOrderCents : 0;
      this.setData({ catalogError: '', settingsReady: true });
    } catch (error) {
      this.setData({ catalogError: '暂时无法确认商品和配送信息，请稍后重试' });
    }
    this.refresh();
  },
  refresh() {
    const summary = cart.getSummary();
    const cents = Math.round(Number(summary.total) * 100);
    this.setData({ ...summary, deliveryFee: ((this._feeCents || 0) / 100).toFixed(2),
      payable: ((cents + (this._feeCents || 0)) / 100).toFixed(2),
      minOrder: ((this._minCents || 0) / 100).toFixed(2), belowMinimum: cents < (this._minCents || 0) });
  },
  add(e) { cart.change(e.currentTarget.dataset.id, 1); this.refresh(); },
  reduce(e) { cart.change(e.currentTarget.dataset.id, -1); this.refresh(); },
  clearCart() {
    wx.showModal({
      title: '清空购物车', content: '确定移除所有商品吗？',
      success: result => { if (result.confirm) { cart.clear(); this.refresh(); } }
    });
  },
  goShop() { wx.switchTab({ url: '/pages/snack-home/index' }); },
  goCheckout() {
    if (!this.data.count || !this.data.settingsReady || this.data.catalogError) return;
    if (this.data.belowMinimum) { this.goShop(); return; }
    wx.navigateTo({ url: '/pages/snack-checkout/index' });
  }
});
