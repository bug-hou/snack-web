const cart = require('../../utils/snack-cart');
const { products, loadProducts } = require('../../utils/snack-catalog');
const { callShop } = require('../../utils/snack-cloud');
const { getAddresses } = require('../../utils/snack-address');

Page({
  data: {
    items: [], count: 0, total: '0.00',
    selectedAddress: null, note: '',
    deliveryOptions: ['尽快送达', '白天送达', '晚上送达'], deliveryIndex: 0,
    ordersEnabled: false, submitting: false, loading: true, loadError: '', directPurchase: false,
    deliveryFee: '0.00', payable: '0.00', minOrder: '0.00', belowMinimum: false, canOrder: false,
    shopNotice: '小店暂未营业，当前无法提交订单。'
  },
  onLoad(options) { this._productId = options && options.productId ? decodeURIComponent(options.productId) : ''; },
  getSelection() {
    if (!this._productId) return cart.getSummary();
    const product = products.find(item => item.id === this._productId);
    if (!product) return { items: [], count: 0, total: '0.00' };
    return { items: [{ ...product, quantity: 1, subtotal: product.price }], count: 1, total: product.price };
  },
  async onShow() {
    this.setData({ loading: true, loadError: '', selectedAddress: null, ordersEnabled: false, canOrder: false, directPurchase: !!this._productId });
    try {
      const [_, addressResult] = await Promise.all([loadProducts(), getAddresses()]);
      this.setData({ selectedAddress: addressResult.selected });
      const summary = this.getSelection();
      if (!summary.count) {
        wx.showToast({ title: '商品已下架，请重新选择', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({ ...summary, loading: false });
      const config = await callShop('getContext');
      const fee = Number.isSafeInteger(config.deliveryFeeCents) ? config.deliveryFeeCents : 0;
      const minimum = Number.isSafeInteger(config.minOrderCents) ? config.minOrderCents : 0;
      const subtotal = Math.round(Number(summary.total) * 100);
      this.setData({
        ordersEnabled: !!config.isOpen,
        deliveryFee: (fee / 100).toFixed(2), payable: ((subtotal + fee) / 100).toFixed(2),
        minOrder: (minimum / 100).toFixed(2), belowMinimum: subtotal < minimum,
        canOrder: !!config.isOpen && subtotal >= minimum && !!addressResult.selected,
        shopNotice: config.ordersEnabled
          ? `营业 ${config.businessStart}—${config.businessEnd}，配送 ${config.deliveryStart}—${config.deliveryEnd}。仅在两个时段内接受订单。`
          : '小店暂未营业，当前无法提交订单。'
      });
    } catch (error) {
      this.setData({ ordersEnabled: false, canOrder: false, loading: false, loadError: '暂时无法确认商品信息，请稍后再试' });
    }
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index?from=checkout' }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
  onDeliveryChange(e) { this.setData({ deliveryIndex: Number(e.detail.value) }); },
  async submitOrder() {
    if (this.data.submitting) return;
    if (!this.data.selectedAddress) {
      this.goAddress();
      return;
    }
    if (!this.data.ordersEnabled) {
      wx.showModal({ title: '暂时无法下单', content: this.data.shopNotice, showCancel: false });
      return;
    }
    if (this.data.belowMinimum) {
      wx.showToast({ title: `商品满${this.data.minOrder}元起送`, icon: 'none' });
      return;
    }
    const { selectedAddress, note, deliveryIndex, deliveryOptions } = this.data;
    if (!selectedAddress) {
      wx.showToast({ title: '请先添加收货地址', icon: 'none' });
      this.goAddress();
      return;
    }
    const summary = this.getSelection();
    if (!summary.count || this.data.loadError) return;
    if (!this._requestId) this._requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    this.setData({ submitting: true });
    try {
      const order = await callShop('createOrder', {
        requestId: this._requestId, addressId: selectedAddress.id, note: note.trim(),
        expectedTotalCents: Math.round(Number(this.data.payable) * 100),
        delivery: deliveryOptions[deliveryIndex],
        items: summary.items.map(item => ({ id: item.id, quantity: item.quantity }))
      });
      this._requestId = null;
      if (!this._productId) cart.clear();
      wx.showModal({ title: '下单成功', content: `订单合计 ¥${order.total}（含配送费 ¥${order.deliveryFee}）。配货完成后送往家门口，送达时线下付款。`,
        showCancel: false, success: () => wx.switchTab({ url: '/pages/snack-orders/index' }) });
    } catch (error) {
      wx.showToast({ title: error.message || '下单失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
