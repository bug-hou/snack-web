const { products, categories, loadProducts } = require('../../utils/snack-catalog');
const { peekContext, loadContext } = require('../../utils/snack-context');
const { getAddresses, peekAddresses } = require('../../utils/snack-address');
const cart = require('../../utils/snack-cart');
const { services } = require('../../utils/snack-community');

const shopStatusText = config => config.isOpen ? '接单中' : config.ordersEnabled ? '当前休息中' : '暂未营业';

Page({
  data: {
    services,
    refreshing: false,
    scrollTarget: '',
    categories,
    activeCategory: 'all',
    keyword: '',
    products: [],
    featured: products.filter(product => product.featured),
    count: 0,
    total: '0.00',
    catalogError: '',
    loading: true,
    shopStatus: '',
    addressText: '添加收货地址', addressHint: '选择楼栋和门牌号，送货上门'
  },

  onShow() {
    // 先用本地缓存立即渲染，再静默刷新
    const cachedContext = peekContext();
    if (cachedContext) this.setData({ shopStatus: shopStatusText(cachedContext) });
    this.applyAddress(peekAddresses());
    this.refresh();
    this.loadCatalog(); this.loadShopStatus(); this.loadAddress();
  },
  async onPullDownRefresh() {
    try { await this.refreshCommunity(); }
    finally { wx.stopPullDownRefresh(); }
  },
  async refreshCommunity() {
    if (this.data.refreshing) return;
    this.setData({ refreshing: true });
    try { await Promise.all([this.loadCatalog(), this.loadShopStatus(), this.loadAddress()]); }
    finally { this.setData({ refreshing: false }); }
  },
  openService(event) {
    const id = event.currentTarget.dataset.id;
    if (!services.some(service => service.id === id)) return;
    wx.navigateTo({ url: `/pages/community-service/index?type=${encodeURIComponent(id)}` });
  },
  goOrders() { wx.switchTab({ url: '/pages/snack-orders/index' }); },
  goCatalog() {
    this.setData({ scrollTarget: '' }, () => {
      this.setData({ scrollTarget: 'community-catalog' });
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
  },
  applyAddress(result) {
    const selected = result && result.selected;
    this.setData({ addressText: selected ? `保利爱尚里 ${selected.building}栋 ${selected.room}` : '添加收货地址',
      addressHint: selected ? `${selected.recipient} · 送到家门口` : '选择楼栋和门牌号，送货上门' });
  },
  async loadAddress() {
    try { this.applyAddress(await getAddresses()); }
    catch (error) { this.setData({ addressText: '选择收货地址', addressHint: '点击管理常用地址' }); }
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index' }); },
  async loadShopStatus() {
    try {
      const config = await loadContext();
      this.setData({ shopStatus: shopStatusText(config) });
    } catch (error) { /* 保留缓存中的状态 */ }
  },
  async loadCatalog() {
    this.setData({ loading: !products.length, catalogError: '' });
    try {
      await loadProducts();
      this.setData({ featured: products.filter(product => product.featured), loading: false });
      this.refresh();
    } catch (error) {
      this.setData({ featured: products.filter(product => product.featured), loading: false, catalogError: '商品加载失败，请下拉刷新重试' });
      this.refresh();
    }
  },

  refresh() {
    const summary = cart.getSummary();
    const keyword = this.data.keyword.trim().toLowerCase();
    const quantities = {};
    summary.items.forEach(item => { quantities[item.id] = item.quantity; });
    const visible = products.filter(product =>
      (this.data.activeCategory === 'all' || product.category === this.data.activeCategory) &&
      (!keyword || product.name.toLowerCase().includes(keyword) || product.spec.toLowerCase().includes(keyword))
    ).map(product => ({ ...product, quantity: quantities[product.id] || 0 }));
    this.setData({ products: visible, count: summary.count, total: summary.total });
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }, () => this.refresh()); },
  clearSearch() { this.setData({ keyword: '' }, () => this.refresh()); },
  selectCategory(e) { this.setData({ activeCategory: e.currentTarget.dataset.id }, () => this.refresh()); },
  add(e) { cart.change(e.currentTarget.dataset.id, 1); this.refresh(); },
  reduce(e) { cart.change(e.currentTarget.dataset.id, -1); this.refresh(); },
  buyNow(e) {
    const id = e.currentTarget.dataset.id;
    if (!products.some(product => product.id === id)) return;
    wx.navigateTo({ url: `/pages/snack-checkout/index?productId=${encodeURIComponent(id)}` });
  },
  retryCatalog() { this.loadCatalog(); },
  openCart() { wx.switchTab({ url: '/pages/snack-cart/index' }); }
});
