const { products, categories, loadProducts } = require('../../utils/snack-catalog');
const { peekContext, loadContext } = require('../../utils/snack-context');
const { getAddresses, peekAddresses } = require('../../utils/snack-address');
const cart = require('../../utils/snack-cart');
const { callShop } = require('../../utils/snack-cloud');
const { services } = require('../../utils/snack-community');

const shopStatusText = config => config.isOpen ? '接单中' : config.ordersEnabled ? '当前休息中' : '暂未营业';
const SERVICE_PAGES = { express: 'community-errand', purchase: 'community-errand' };
const SHARE_TONES = ['peach', 'sage', 'butter'];

Page({
  data: {
    services,
    categories,
    activeCategory: 'all',
    keyword: '',
    products: [],
    featured: products.filter(product => product.featured),
    shares: [],
    shareHint: '正在加载邻里闲置…',
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
    this.loadCatalog(); this.loadShopStatus(); this.loadAddress(); this.loadShares();
  },
  async onPullDownRefresh() {
    try { await this.refreshCommunity(); }
    finally { wx.stopPullDownRefresh(); }
  },
  async refreshCommunity() {
    await Promise.all([this.loadCatalog(), this.loadShopStatus(), this.loadAddress(), this.loadShares()]);
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
  async loadShares() {
    try {
      const list = await callShop('listShares', { scope: 'all' });
      const shares = list.slice(0, 3).map((item, index) => ({
        id: item.id, title: item.title, modeText: item.modeText,
        priceText: item.mode === 'sale' ? `¥${item.price}` : '免费',
        cover: item.images && item.images.length ? item.images[0] : '',
        initials: (item.title || '闲置').slice(0, 2),
        tone: SHARE_TONES[index % SHARE_TONES.length]
      }));
      this.setData({ shares, shareHint: shares.length ? '' : '还没有邻居发布闲置，成为第一个吧' });
    } catch (error) {
      this.setData({ shareHint: '闲置加载失败，下拉刷新重试' });
    }
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

  openService(e) {
    const id = e.currentTarget.dataset.id;
    if (!services.some(service => service.id === id)) return;
    if (id === 'secondhand') { this.goShares(); return; }
    const page = SERVICE_PAGES[id];
    if (page) wx.navigateTo({ url: `/pages/${page}/index?type=${encodeURIComponent(id)}` });
    else wx.navigateTo({ url: `/pages/community-service/index?type=${encodeURIComponent(id)}` });
  },
  goShares() { wx.navigateTo({ url: '/pages/community-share/index' }); },
  goPublish() { wx.navigateTo({ url: '/pages/community-share-form/index' }); },
  openShare(e) { wx.navigateTo({ url: `/pages/community-share-detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  goOrders() { wx.switchTab({ url: '/pages/snack-orders/index' }); },
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
