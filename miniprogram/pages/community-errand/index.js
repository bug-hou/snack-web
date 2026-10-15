const { getAddresses } = require('../../utils/snack-address');
const { peekContext, loadContext } = require('../../utils/snack-context');
const { callShop } = require('../../utils/snack-cloud');
const { parsePickupText } = require('../../utils/snack-parser');

const PACKAGE_SIZES = [
  { value: 'small', label: '小件', hint: '鞋服小物' },
  { value: 'large', label: '大件', hint: '整箱重物' }
];
const CONDITIONS = [{ value: 'new', label: '几乎全新' }, { value: 'like', label: '九成新' }, { value: 'used', label: '七成新' }, { value: 'worn', label: '有使用痕迹' }];
const QUICK_NOTES = ['放门口即可', '到达前打电话', '家里有人，直接敲门', '先放驿站，我自取'];
const MAX_PACKAGES = 20;
const SMS_SAMPLE = '【菜鸟驿站】请凭取件码 8-1-2345 到菜鸟驿站（16栋架空层）领取包裹，手机号尾号 6789。';

const money = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
const safeCents = value => (Number.isSafeInteger(value) ? value : 0);
// 兼容旧版本缓存里没有大件加价字段的情况
const expressFee = (config, count, largeCount) =>
  safeCents(config.baseFeeCents) + safeCents(config.extraFeeCents) * Math.max(count - 1, 0) + safeCents(config.largeFeeCents) * largeCount;
const emptyPackage = () => ({ code: '', phoneLast4: '', size: 'small' });
const emptyItem = () => ({ name: '', spec: '', quantity: 1 });

Page({
  data: {
    type: 'express', title: '快递代取', subtitle: '选择站点，粘贴短信自动识别取件码',
    config: null, loading: true, submitting: false, error: '',
    addresses: [], addressIndex: -1, addressText: '', addressPerson: '', addressTail: '',
    stations: [], station: '',
    packages: [emptyPackage()], maxPackages: MAX_PACKAGES,
    smsOpen: false, smsText: '', smsSample: SMS_SAMPLE, parseNote: '', parseTone: '',
    items: [emptyItem()], allowSubstitute: true, budget: '',
    sizes: PACKAGE_SIZES, conditions: CONDITIONS, quickNotes: QUICK_NOTES.map(text => ({ text, active: false })), activeNotes: [],
    note: '', feeText: '0.00', feeDetail: [], feeRule: '',
    statusText: '', statusTone: '', serviceTime: ''
  },
  onLoad(options) {
    const type = options && options.type === 'purchase' ? 'purchase' : 'express';
    this.setData({ type, title: type === 'express' ? '快递代取' : '京东便利店代买',
      subtitle: type === 'express' ? '选择站点，粘贴短信自动识别取件码' : '列好清单，跑腿带回' });
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
      this._loaded = true;
    } catch (error) {
      this.setData({ loading: false, error: error.message || '加载失败，请下拉重试' });
    }
  },
  applyConfig(context) {
    const config = this.data.type === 'express' ? context.express : context.purchase;
    if (!config) return;
    const stations = Array.isArray(config.stations) ? config.stations : [];
    const station = stations.includes(this.data.station) ? this.data.station
      : (stations.length === 1 ? stations[0] : '');
    const tone = config.enabled ? 'on' : config.configured ? 'wait' : 'off';
    this.setData({ config, stations, station,
      statusText: config.enabled ? '营业中' : config.configured ? '休息中' : '暂未开放',
      statusTone: tone, serviceTime: `${config.start}—${config.end}`,
      feeRule: this.data.type === 'express'
        ? `首件 ¥${money(config.baseFeeCents)}，每多一件 +¥${money(config.extraFeeCents)}${safeCents(config.largeFeeCents) > 0 ? `，大件 +¥${money(config.largeFeeCents)}` : ''}`
        : `跑腿费 ¥${money(config.feeCents)}，商品金额按实际门店报价` });
    this.recompute();
  },
  applyAddresses(result) {
    const list = (result && result.list) || [];
    const selected = result && result.selected;
    const index = selected ? list.findIndex(item => item.id === selected.id) : 0;
    const current = list[index] || null;
    this.setData({ addresses: list, addressIndex: list.length ? (index >= 0 ? index : 0) : -1 });
    this.renderAddress(current);
  },
  renderAddress(current) {
    if (!current) {
      this.setData({ addressText: '还没有收货地址', addressPerson: '添加一个地址，下单就不用重复填', addressTail: '' });
      return;
    }
    const tail = current.pickupPhoneLast4 || String(current.phone || '').slice(-4);
    this.setData({ addressText: `保利爱尚里 ${current.building}栋 ${current.room}`,
      addressPerson: `${current.recipient} · ${current.phone}`, addressTail: tail,
      packages: this.data.packages.map(pkg => ({ ...pkg, phoneLast4: pkg.phoneLast4 || tail })) });
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index?from=errand' }); },

  pickStation(e) { this.setData({ station: e.currentTarget.dataset.value }); },

  openSms() { this.setData({ smsOpen: true, parseNote: '', parseTone: '' }); },
  closeSms() { this.setData({ smsOpen: false }); },
  smsInput(e) { this.setData({ smsText: e.detail.value }); },
  clearSms() { this.setData({ smsText: '', parseNote: '', parseTone: '' }); },
  readClipboard() {
    wx.getClipboardData({
      success: res => {
        const value = (res && res.data) || '';
        if (!String(value).trim()) { wx.showToast({ title: '剪贴板是空的，请长按粘贴', icon: 'none' }); return; }
        this.setData({ smsText: String(value).slice(0, 2000) }, () => this.parseSms());
      },
      fail: () => wx.showToast({ title: '读取失败，请长按粘贴', icon: 'none' })
    });
  },
  parseSms() {
    const result = parsePickupText(this.data.smsText, this.data.stations);
    if (!result.packages.length) {
      this.setData({ parseNote: result.warnings[0] || '没能识别出取件码', parseTone: 'warn' });
      return;
    }
    const current = this.data.addresses[this.data.addressIndex];
    const tail = current ? (current.pickupPhoneLast4 || String(current.phone || '').slice(-4)) : '';
    const incoming = result.packages.map(pkg => ({ ...pkg, phoneLast4: pkg.phoneLast4 || tail }));
    // 首个包裹还没填就直接覆盖，否则追加，最多 5 个
    let packages = this.data.packages;
    if (packages.length === 1 && !packages[0].code) packages = [];
    const merged = packages.concat(incoming).slice(0, MAX_PACKAGES);
    const patch = { packages: merged, parseNote: `识别到 ${incoming.length} 个包裹，已填入，可再核对一下`, parseTone: 'ok', smsOpen: false };
    const guessed = incoming.find(pkg => pkg.station && this.data.stations.includes(pkg.station));
    if (guessed && !this.data.station) patch.station = guessed.station;
    if (merged.length < packages.length + incoming.length) {
      patch.parseNote = `识别到 ${incoming.length} 个包裹，一次最多代取 ${MAX_PACKAGES} 个，已取前 ${MAX_PACKAGES} 个`;
      patch.parseTone = 'warn';
    }
    this.setData(patch, () => this.recompute());
  },

  input(e) {
    const { group, index, key } = e.currentTarget.dataset;
    const value = e.detail.value;
    if (group === 'package') this.setData({ [`packages[${index}].${key}`]: value });
    else if (group === 'item') this.setData({ [`items[${index}].${key}`]: value });
  },
  pickSize(e) {
    this.setData({ [`packages[${e.currentTarget.dataset.index}].size`]: e.currentTarget.dataset.value }, () => this.recompute());
  },
  addPackage() {
    if (this.data.packages.length >= MAX_PACKAGES) { wx.showToast({ title: `一次最多${MAX_PACKAGES}个包裹`, icon: 'none' }); return; }
    const current = this.data.addresses[this.data.addressIndex];
    this.setData({ packages: this.data.packages.concat({ ...emptyPackage(),
      phoneLast4: current ? (current.pickupPhoneLast4 || String(current.phone || '').slice(-4)) : '' }) }, () => this.recompute());
  },
  removePackage(e) {
    const index = e.currentTarget.dataset.index;
    if (this.data.packages.length <= 1) return;
    this.setData({ packages: this.data.packages.filter((_, i) => i !== index) }, () => this.recompute());
  },
  async onShow() {
    if (this._loaded) {
      try { this.applyAddresses(await getAddresses()); }
      catch (error) { /* 保留当前选择 */ }
    }
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
  noteInput(e) {
    const note = e.detail.value;
    this.setData({ note, quickNotes: this.data.quickNotes.map(item => ({ ...item, active: note.indexOf(item.text) >= 0 })) });
  },
  toggleNote(e) {
    const note = e.currentTarget.dataset.value;
    const active = this.data.activeNotes.includes(note) ? this.data.activeNotes.filter(item => item !== note) : this.data.activeNotes.concat(note);
    this.setData({ activeNotes: active, note: active.join('；'),
      quickNotes: this.data.quickNotes.map(item => ({ ...item, active: active.includes(item.text) })) });
  },

  expectedFee() {
    const config = this.data.config;
    if (!config) throw new Error('服务配置尚未加载');
    if (this.data.type !== 'express') return config.feeCents;
    const largeCount = this.data.packages.filter(pkg => pkg.size === 'large').length;
    return expressFee(config, this.data.packages.length, largeCount);
  },
  recompute() {
    const config = this.data.config;
    if (!config) return;
    if (this.data.type !== 'express') { this.setData({ feeText: money(config.feeCents), feeDetail: [] }); return; }
    const count = this.data.packages.length;
    const largeCount = this.data.packages.filter(pkg => pkg.size === 'large').length;
    const fee = expressFee(config, count, largeCount);
    const detail = [{ label: `首件跑腿费（${count} 件）`, value: money(config.baseFeeCents) }];
    if (count > 1) detail.push({ label: `加 ${count - 1} 件`, value: money(config.extraFeeCents * (count - 1)) });
    if (largeCount > 0) detail.push({ label: `大件 ${largeCount} 件`, value: money(config.largeFeeCents * largeCount) });
    this.setData({ feeText: money(fee), feeDetail: detail });
  },
  async submit() {
    if (this.data.submitting) return;
    const { type, config, addresses, addressIndex, station, packages, items, budget, note } = this.data;
    if (!config || !config.enabled) { wx.showToast({ title: this.data.statusText === '休息中' ? `当前不在服务时间（${this.data.serviceTime}）` : '服务暂未开放', icon: 'none' }); return; }
    const address = addresses[addressIndex];
    if (!address) { wx.showToast({ title: '请选择收货地址', icon: 'none' }); return; }
    const payload = { type, addressId: address.id, requestId: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      note, expectedTotalCents: this.expectedFee(), deliveryAt: 0 };
    if (type === 'express') {
      if (!this.data.stations.length) { wx.showToast({ title: '商家还没配置快递站点', icon: 'none' }); return; }
      if (!station) { wx.showToast({ title: '请选择快递站点', icon: 'none' }); return; }
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
    const summary = type === 'express'
      ? `站点：${station}\n包裹：${payload.packages.length} 个\n收货：${this.data.addressText}\n跑腿费：¥${money(payload.expectedTotalCents)}（货到付款）`
      : `门店：${config.store || '京东便利店'}\n商品：${payload.items.length} 项\n收货：${this.data.addressText}\n跑腿费：¥${money(payload.expectedTotalCents)}，商品按实际报价`;
    const confirmed = await new Promise(resolve => wx.showModal({
      title: type === 'express' ? '确认代取信息' : '确认代买清单', content: summary,
      confirmText: '确认下单', cancelText: '再看看',
      success: res => resolve(res.confirm), fail: () => resolve(false)
    }));
    if (!confirmed) return;
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
