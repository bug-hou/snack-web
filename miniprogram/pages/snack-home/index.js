const { products, categories, loadProducts } = require('../../utils/snack-catalog');
const { callShop } = require('../../utils/snack-cloud');
const { getAddresses } = require('../../utils/snack-address');
const cart = require('../../utils/snack-cart');

Page({
  data: {
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

  onShow() { this.refresh(); this.loadCatalog(); this.loadShopStatus(); this.loadAddress(); },
  async onPullDownRefresh() {
    await Promise.all([this.loadCatalog(), this.loadShopStatus(), this.loadAddress()]);
    wx.stopPullDownRefresh();
  },
  async loadAddress() {
    try {
      const { selected } = await getAddresses();
      this.setData({ addressText: selected ? `保利爱尚里 ${selected.building}栋 ${selected.room}` : '添加收货地址',
        addressHint: selected ? `${selected.recipient} · 送到家门口` : '选择楼栋和门牌号，送货上门' });
    } catch (error) { this.setData({ addressText: '选择收货地址', addressHint: '点击管理常用地址' }); }
  },
  goAddress() { wx.navigateTo({ url: '/pages/snack-address/index' }); },
  async loadShopStatus() {
    try {
      const config = await callShop('getContext');
      this.setData({ shopStatus: config.isOpen ? '接单中' : config.ordersEnabled ? '当前休息中' : '暂未营业' });
    } catch (error) { this.setData({ shopStatus: '' }); }
  },
  async loadCatalog() {
    this.setData({ loading: true, catalogError: '' });
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
