const cart = require('../../utils/snack-cart');
const { products, loadProducts } = require('../../utils/snack-catalog');
const { callShop } = require('../../utils/snack-cloud');
const { peekContext, loadContext } = require('../../utils/snack-context');
const { getAddresses, peekAddresses } = require('../../utils/snack-address');

const STEP_MINUTES = 5;
const STEP_MS = STEP_MINUTES * 60 * 1000;
const MAX_DAYS = 7;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const pad = n => String(n).padStart(2, '0');
const toMinutes = clock => { const [h, m] = String(clock || '').split(':').map(Number); return h * 60 + m; };

Page({
  data: {
    items: [], count: 0, total: '0.00',
    selectedAddress: null, note: '',
    timeRange: [[], [], []], timeIndex: [0, 0, 0], deliveryAt: 0, deliveryText: '尽快送达',
    ordersEnabled: false, submitting: false, loading: true, loadError: '', directPurchase: false, configReady: false,
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
    // 先用本地缓存的地址与店铺设置立即渲染，默认选中首页展示的地址
    const cachedAddress = peekAddresses();
    this._config = peekContext();
    this._ready = false;
    this.setData({ loading: !products.length, loadError: '', configReady: false, directPurchase: !!this._productId,
      selectedAddress: cachedAddress ? cachedAddress.selected : null });
    this.buildTimeRange(this._config);
    this.recompute();
    try {
      const [, addressResult, config] = await Promise.all([loadProducts(), getAddresses(), loadContext()]);
      this._config = config;
      this._ready = true;
      if (!this.getSelection().count) {
        wx.showToast({ title: '商品已下架，请重新选择', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({ selectedAddress: addressResult.selected, loading: false, configReady: true });
      this.buildTimeRange(config);
      this.recompute();
    } catch (error) {
      this.setData({ ordersEnabled: false, canOrder: false, loading: false, loadError: '暂时无法确认商品信息，请稍后再试' });
    }
  },
  recompute() {
    const summary = this.getSelection();
    const config = this._config || {};
    const fee = Number.isSafeInteger(config.deliveryFeeCents) ? config.deliveryFeeCents : 0;
    const minimum = Number.isSafeInteger(config.minOrderCents) ? config.minOrderCents : 0;
    const subtotal = Math.round(Number(summary.total) * 100);
    const open = this._ready && !!config.isOpen;
    this.setData({
      ...summary,
      ordersEnabled: open,
      deliveryFee: (fee / 100).toFixed(2), payable: ((subtotal + fee) / 100).toFixed(2),
      minOrder: (minimum / 100).toFixed(2), belowMinimum: subtotal < minimum,
      canOrder: open && subtotal >= minimum && !!this.data.selectedAddress,
      shopNotice: config.ordersEnabled
        ? `营业 ${config.businessStart}—${config.businessEnd}，配送 ${config.deliveryStart}—${config.deliveryEnd}。仅在两个时段内接受订单。`
        : '小店暂未营业，当前无法提交订单。'
    });
  },

  // 期望送达：日期（今天起 7 天内）+ 时 + 分（5 分钟间隔）
  buildTimeRange(config) {
    const start = config && config.deliveryStart ? config.deliveryStart : '09:00';
    const end = config && config.deliveryEnd ? config.deliveryEnd : '22:00';
    this._window = { start: toMinutes(start), end: toMinutes(end) };
    const now = new Date();
    this._days = [];
    const dayLabels = [];
    for (let i = 0; i <= MAX_DAYS; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      this._days.push(day);
      dayLabels.push(i === 0 ? '今天' : i === 1 ? '明天' : `${day.getMonth() + 1}月${day.getDate()}日 周${WEEKDAYS[day.getDay()]}`);
    }
    this._hours = [];
    for (let h = Math.floor(this._window.start / 60); h <= Math.floor(this._window.end / 60); h++) this._hours.push(h);
    this._minutes = [];
    for (let m = 0; m < 60; m += STEP_MINUTES) this._minutes.push(m);
    const first = new Date(Math.ceil(Date.now() / STEP_MS) * STEP_MS);
    const hourIndex = Math.max(0, this._hours.indexOf(first.getHours()));
    const minuteIndex = Math.max(0, this._minutes.indexOf(first.getMinutes()));
    this.setData({
      timeRange: [dayLabels, this._hours.map(h => `${pad(h)}时`), this._minutes.map(m => `${pad(m)}分`)],
      timeIndex: this.data.deliveryAt ? this.data.timeIndex : [0, hourIndex, minuteIndex]
    });
  },
  onTimeChange(e) {
    const [dayIndex, hourIndex, minuteIndex] = e.detail.value.map(Number);
    const day = this._days[dayIndex];
    const hour = this._hours[hourIndex];
    const minute = this._minutes[minuteIndex];
    if (!day || hour === undefined || minute === undefined) return;
    const target = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
    const minutesOfDay = hour * 60 + minute;
    if (minutesOfDay < this._window.start || minutesOfDay > this._window.end) {
      wx.showToast({ title: '请选择配送时段内的时间', icon: 'none' });
      return;
    }
    if (target < Math.ceil(Date.now() / STEP_MS) * STEP_MS) {
      wx.showToast({ title: '不能选择已过去的时间', icon: 'none' });
      return;
    }
    if (target > Date.now() + MAX_DAYS * 24 * 60 * 60 * 1000) {
      wx.showToast({ title: '最多可选择未来 7 天内的时间', icon: 'none' });
      return;
    }
    const dayText = dayIndex === 0 ? '今天' : dayIndex === 1 ? '明天' : `${day.getMonth() + 1}月${day.getDate()}日`;
    this.setData({ deliveryAt: target, deliveryText: `${dayText} ${pad(hour)}:${pad(minute)}`, timeIndex: [dayIndex, hourIndex, minuteIndex] });
  },
  useAsap() { this.setData({ deliveryAt: 0, deliveryText: '尽快送达' }); },

  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index?from=checkout' }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
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
    const { selectedAddress, note, deliveryAt } = this.data;
    if (deliveryAt && deliveryAt < Date.now()) {
      this.useAsap();
      wx.showToast({ title: '所选送达时间已过，请重新选择', icon: 'none' });
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
        deliveryAt: deliveryAt || 0,
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
