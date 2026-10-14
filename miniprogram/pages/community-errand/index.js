const { getAddresses } = require('../../utils/snack-address');
const { peekContext, loadContext } = require('../../utils/snack-context');
const { callShop } = require('../../utils/snack-cloud');

const PACKAGE_SIZES = [{ value: 'small', label: '小件' }, { value: 'large', label: '大件' }];
const CONDITIONS = [{ value: 'new', label: '几乎全新' }, { value: 'like', label: '九成新' }, { value: 'used', label: '七成新' }, { value: 'worn', label: '有使用痕迹' }];
const money = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
const emptyPackage = () => ({ code: '', phoneLast4: '', size: 'small' });
const emptyItem = () => ({ name: '', spec: '', quantity: 1 });

Page({
  data: {
    type: 'express', title: '快递代取', subtitle: '填写取件码和手机尾号',
    config: null, loading: true, submitting: false, error: '',
    addresses: [], addressIds: [], addressIndex: -1, addressText: '',
    stations: [], stationIndex: -1, customStation: '',
    packages: [emptyPackage()],
    items: [emptyItem()], allowSubstitute: true, budget: '',
    sizes: PACKAGE_SIZES, conditions: CONDITIONS,
    note: '', feeText: '0.00', feeRule: '', openText: ''
  },
  onLoad(options) {
    const type = options && options.type === 'purchase' ? 'purchase' : 'express';
    this.setData({ type, title: type === 'express' ? '快递代取' : '京东便利店代买',
      subtitle: type === 'express' ? '填写取件码和手机尾号' : '列好清单，跑腿带回' });
    wx.setNavigationBarTitle({ title: type === 'express' ? '快递代取' : '便利店代买' });
    const cached = peekContext();
    if (cached) this.applyConfig(cached);
    this.loadAll();
  },
  async loadAll() {
    this.setData({ loading: true, error: '' });
    try {
      const [context, addressResult] = await Promise.all([loadContext(), getAddresses()]);
      this.applyConfig(context);
      this.applyAddresses(addressResult);
      this.setData({ loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '加载失败，请下拉重试' });
    }
  },
  applyConfig(context) {
    const config = this.data.type === 'express' ? context.express : context.purchase;
    if (!config) return;
    const stations = Array.isArray(config.stations) ? config.stations : [];
    this.setData({ config, stations,
      feeRule: this.data.type === 'express' ? `跑腿费 ¥${money(config.baseFeeCents)} 起，每多一件加 ¥${money(config.extraFeeCents)}` : `跑腿费 ¥${money(config.feeCents)}，商品金额按实际门店报价`,
      openText: config.enabled ? `服务时间 ${config.start}—${config.end}` : config.configured ? `当前不在服务时间（${config.start}—${config.end}）` : '服务暂未开放，请稍后再来' });
    this.recompute();
  },
  applyAddresses(result) {
    const list = (result && result.list) || [];
    const selected = result && result.selected;
    const index = selected ? list.findIndex(item => item.id === selected.id) : 0;
    const current = list[index] || null;
    this.setData({ addresses: list, addressIds: list.map(item => `保利爱尚里 ${item.building}栋 ${item.room}`),
      addressIndex: list.length ? (index >= 0 ? index : 0) : -1,
      addressText: current ? `保利爱尚里 ${current.building}栋 ${current.room} · ${current.recipient}` : '还没有收货地址' });
    if (current) {
      const tail = current.pickupPhoneLast4 || current.phone.slice(-4);
      this.setData({ packages: this.data.packages.map(pkg => ({ ...pkg, phoneLast4: pkg.phoneLast4 || tail })) });
    }
  },
  pickAddress(e) {
    const index = Number(e.detail.value);
    const current = this.data.addresses[index];
    if (!current) return;
    const tail = current.pickupPhoneLast4 || current.phone.slice(-4);
    this.setData({ addressIndex: index, addressText: `保利爱尚里 ${current.building}栋 ${current.room} · ${current.recipient}`,
      packages: this.data.packages.map(pkg => ({ ...pkg, phoneLast4: pkg.phoneLast4 || tail })) });
  },
  pickStation(e) { this.setData({ stationIndex: Number(e.detail.value) }); },
  stationInput(e) { this.setData({ customStation: e.detail.value }); },
  input(e) {
    const { group, index, key } = e.currentTarget.dataset;
    const value = e.detail.value;
    if (group === 'package') this.setData({ [`packages[${index}].${key}`]: value });
    else if (group === 'item') this.setData({ [`items[${index}].${key}`]: value });
  },
  pickSize(e) { this.setData({ [`packages[${e.currentTarget.dataset.index}].size`]: e.currentTarget.dataset.value }); },
  addPackage() {
    if (this.data.packages.length >= 5) { wx.showToast({ title: '一次最多5个包裹', icon: 'none' }); return; }
    const current = this.data.addresses[this.data.addressIndex];
    this.setData({ packages: this.data.packages.concat({ ...emptyPackage(),
      phoneLast4: current ? (current.pickupPhoneLast4 || current.phone.slice(-4)) : '' }) });
    this.recompute();
  },
  removePackage(e) {
    const index = e.currentTarget.dataset.index;
    if (this.data.packages.length <= 1) return;
    this.setData({ packages: this.data.packages.filter((_, i) => i !== index) });
    this.recompute();
  },
  addItem() {
    if (this.data.items.length >= 10) { wx.showToast({ title: '最多10项', icon: 'none' }); return; }
    this.setData({ items: this.data.items.concat(emptyItem()) });
  },
  removeItem(e) {
    const index = e.currentTarget.dataset.index;
    if (this.data.items.length <= 1) return;
    this.setData({ items: this.data.items.filter((_, i) => i !== index) });
  },
  toggleSubstitute() { this.setData({ allowSubstitute: !this.data.allowSubstitute }); },
  budgetInput(e) { this.setData({ budget: e.detail.value }); },
  noteInput(e) { this.setData({ note: e.detail.value }); },
  recompute() {
    const config = this.data.config;
    if (!config) return;
    const fee = this.data.type === 'express'
      ? config.baseFeeCents + config.extraFeeCents * (this.data.packages.length - 1)
      : config.feeCents;
    this.setData({ feeText: money(fee) });
  },
  expectedFee() {
    const config = this.data.config;
    if (!config) throw new Error('服务配置尚未加载');
    return this.data.type === 'express'
      ? config.baseFeeCents + config.extraFeeCents * (this.data.packages.length - 1)
      : config.feeCents;
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index?from=errand' }); },
  async submit() {
    if (this.data.submitting) return;
    const { type, config, addresses, addressIndex, stations, stationIndex, customStation, packages, items, budget, note } = this.data;
    if (!config || !config.enabled) { wx.showToast({ title: this.data.openText || '服务暂未开放', icon: 'none' }); return; }
    const address = addresses[addressIndex];
    if (!address) { wx.showToast({ title: '请选择收货地址', icon: 'none' }); return; }
    const payload = { type, addressId: address.id, requestId: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      note, expectedTotalCents: this.expectedFee(), deliveryAt: 0 };
    if (type === 'express') {
      const station = stations.length ? stations[stationIndex] : customStation.trim();
      if (!station) { wx.showToast({ title: '请选择或填写快递站点', icon: 'none' }); return; }
      const clean = packages.map(pkg => ({ code: (pkg.code || '').trim(), phoneLast4: (pkg.phoneLast4 || '').trim(), size: pkg.size }));
      const invalid = clean.find(pkg => !pkg.code || !/^[0-9A-Za-z-]{4,32}$/.test(pkg.code) || !/^\d{4}$/.test(pkg.phoneLast4));
      if (invalid) { wx.showToast({ title: '请填写取件码和4位手机尾号', icon: 'none' }); return; }
      payload.station = station;
      payload.packages = clean;
    } else {
      const clean = items.map(item => ({ name: (item.name || '').trim(), spec: (item.spec || '').trim(), quantity: Number(item.quantity) || 1 }));
      if (clean.some(item => !item.name || item.quantity < 1 || item.quantity > 20)) {
        wx.showToast({ title: '请填写商品名称和1-20的数量', icon: 'none' }); return;
      }
      const budgetCents = budget === '' ? 0 : Math.round(Number(budget) * 100);
      if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 1000000) {
        wx.showToast({ title: '预估商品金额不正确', icon: 'none' }); return;
      }
      payload.items = clean;
      payload.allowSubstitute = this.data.allowSubstitute;
      payload.budgetCents = budgetCents;
    }
    this.setData({ submitting: true });
    try {
      wx.showLoading({ title: '正在提交', mask: true });
      await callShop('createServiceOrder', payload);
      wx.hideLoading();
      wx.showToast({ title: type === 'express' ? '代取订单已提交' : '代买订单已提交', icon: 'success' });
      wx.switchTab({ url: '/pages/snack-orders/index' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
});
