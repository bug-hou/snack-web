const { callShop } = require('../../utils/snack-cloud');
const { products, loadProducts } = require('../../utils/snack-catalog');
const { peekContext, loadContext } = require('../../utils/snack-context');
const NEXT_STATUS = { pending: 'processing', processing: 'packed', packed: 'delivering', delivering: 'completed', confirmed: 'packed' };
const NEXT_TEXT = { pending: '开始处理', processing: '配货完成', packed: '开始配送', delivering: '确认送达', confirmed: '配货完成' };
const CONTACT_LABELS = { knock: '请敲门', call: '到达后打电话', no_knock: '不要敲门' };
const PROGRESS = { pending: 0, quoted: 0, processing: 1, confirmed: 1, packed: 2, delivering: 3, completed: 4, cancelled: -1 };
const STEPS = ['已下单', '处理中', '已配货', '配送中', '已完成'];
const SERVICE_SIZE = { small: '小件', large: '大件' };
const FINISHED = ['completed', 'cancelled'];
const POLL_ACTIVE_MS = 8000;
const POLL_IDLE_MS = 30000;
const pad = n => String(n).padStart(2, '0');

// 统一按北京时间格式化，避免 toLocaleString 在部分机型上输出异常
function formatTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

Page({
  data: { orders: [], filteredOrders: [], activeTab: 'all', tabs: [
    { id: 'all', name: '全部' }, { id: 'pending', name: '待处理' },
    { id: 'processing', name: '处理中' }, { id: 'packed', name: '已配货' },
    { id: 'delivering', name: '配送中' }, { id: 'completed', name: '已完成' }
  ], isOwner: false, ownerView: false, loading: true, error: '', ownerWechat: '', expandedId: '' },
  onShow() {
    const cached = peekContext();
    if (cached && cached.ownerWechat) this.setData({ ownerWechat: cached.ownerWechat });
    this._visible = true;
    this.loadOrders();
  },
  onHide() { this.stopPolling(); },
  onUnload() { this.stopPolling(); },
  async onPullDownRefresh() { await this.loadOrders(); wx.stopPullDownRefresh(); },

  // 订单状态自动刷新：页面可见时轮询，有进行中订单时更频繁
  stopPolling() {
    this._visible = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },
  schedulePoll() {
    if (this._timer) clearTimeout(this._timer);
    if (!this._visible) return;
    const active = this.data.ownerView || this.data.orders.some(order => !FINISHED.includes(order.status));
    this._timer = setTimeout(() => { this._timer = null; this.loadOrders({ silent: true }); }, active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
  },

  async loadOrders(options = {}) {
    const silent = options.silent === true;
    if (this._fetching) return;
    this._fetching = true;
    if (!silent) this.setData({ loading: true, error: '' });
    try {
      let isOwner = this.data.isOwner;
      if (!silent || !this._contextLoaded) {
        const context = await loadContext();
        isOwner = !!context.isOwner;
        this._contextLoaded = true;
        if ((context.ownerWechat || '') !== this.data.ownerWechat) this.setData({ ownerWechat: context.ownerWechat || '' });
      }
      const ownerView = this.data.ownerView && isOwner;
      // 商品图从目录缓存补齐，失败不影响订单展示
      await loadProducts().catch(() => {});
      const list = await callShop('listOrders', { asOwner: ownerView });
      const signature = JSON.stringify([
        list.map(order => [order.id, order.status, order.updatedAt]),
        this.data.expandedId || ''
      ]);
      if (silent && signature === this._signature && ownerView === this.data.ownerView) return;
      this._signature = signature;
      const orders = list.map(order => this.toViewOrder(order, ownerView));
      const expandedId = this.data.expandedId && orders.some(order => order.id === this.data.expandedId) ? this.data.expandedId : '';
      this.setData({ orders, isOwner, ownerView, expandedId, loading: false, error: '' });
      this.filterOrders();
    } catch (error) {
      // 静默刷新失败时保留当前列表，等待下一次轮询
      if (!silent) this.setData({ loading: false, error: '订单暂时无法加载，下拉刷新试试。', orders: [], filteredOrders: [] });
    } finally {
      this._fetching = false;
      this.schedulePoll();
    }
  },
  serviceView(order, ownerView) {
    const orderType = order.orderType === 'express' || order.orderType === 'purchase' ? order.orderType : 'goods';
    const fallback = { orderType: 'goods', kindText: '口袋便利铺', summaryText: '', serviceLines: [],
      feeLabel: '上门配送费', feeText: `¥${order.deliveryFee || '0.00'}`, quoteText: '', canConfirmQuote: false };
    if (orderType === 'express') {
      const packages = order.packages || [];
      return { ...fallback, orderType, kindText: '快递代取',
        summaryText: `${order.station || '快递站点'} · ${packages.length}个包裹`,
        serviceLines: packages.map((pkg, index) => ({ label: `包裹${index + 1}`, value: `取件码 ${pkg.code} · 尾号 ${pkg.phoneLast4} · ${SERVICE_SIZE[pkg.size] || '小件'}` })),
        feeLabel: '代取跑腿费', feeText: `¥${order.serviceFee || '0.00'}` };
    }
    if (orderType === 'purchase') {
      const items = order.purchaseItems || [];
      return { ...fallback, orderType, kindText: '便利店代买',
        summaryText: `${order.store || '京东便利店'} · ${items.length}项商品`,
        serviceLines: items.map(item => ({ label: item.name, value: `×${item.quantity}${item.spec ? ` · ${item.spec}` : ''}` }))
          .concat([{ label: '缺货替换', value: order.allowSubstitute ? '允许同类替换' : '不接受替换' }]),
        feeLabel: '代买跑腿费', feeText: `¥${order.serviceFee || '0.00'}`,
        quoteText: order.status === 'quoted' ? `店主报价商品 ¥${order.quote || '0.00'}，确认后开始代买` : (Number(order.quoteCents) > 0 ? `商品报价 ¥${order.quote || '0.00'}` : ''),
        canConfirmQuote: !ownerView && order.status === 'quoted' };
    }
    return fallback;
  },
  toViewOrder(order, ownerView) {
    const items = order.items || [];
    const count = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const lines = items.map(item => ({
      ...item,
      quantity: item.quantity,
      subtotal: ((Number.isSafeInteger(item.subtotalCents) ? item.subtotalCents : 0) / 100).toFixed(2)
    }));
    const thumbs = lines.slice(0, 3).map(line => {
      const product = products.find(p => p.id === line.id);
      return { id: line.id, name: line.name, initials: (line.name || '').slice(0, 2), image: product ? product.image : '', tone: product ? product.tone : 'peach' };
    });
    const service = this.serviceView(order, ownerView);
    return {
      orderType: service.orderType, kindText: service.kindText, summaryText: service.orderType === 'goods' ? '' : service.summaryText,
      serviceLines: service.serviceLines, feeLabel: service.feeLabel, feeText: service.feeText,
      quoteText: service.quoteText, canConfirmQuote: service.canConfirmQuote, productLines: lines,
      id: order.id, status: order.status, statusText: order.statusText,
      dateText: formatTime(order.createdAt),
      deliveryText: `${formatTime(order.createdAt)} 下单 · ${order.delivery || '尽快送达'}`,
      recipient: order.recipient, phone: order.phone, address: order.address,
      contactText: CONTACT_LABELS[order.contactPreference] || '请敲门',
      note: order.note || '',
      subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total,
      lines, thumbs, count,
      linesText: lines.map(line => `${line.name} ×${line.quantity}`).join('、'),
      moreCount: Math.max(0, items.length - 3),
      progress: PROGRESS[order.status],
      steps: STEPS,
      stepText: PROGRESS[order.status] >= 0 ? STEPS[PROGRESS[order.status]] : '订单已取消',
      nextStatus: NEXT_STATUS[order.status] || '',
      nextText: NEXT_TEXT[order.status] || '',
      canCancel: !ownerView && order.status === 'pending',
      canDelete: !ownerView && FINISHED.includes(order.status)
    };
  },
  filterOrders() {
    const { orders, activeTab } = this.data;
    this.setData({ filteredOrders: activeTab === 'all' ? orders : orders.filter(order => order.status === activeTab || (activeTab === 'processing' && order.status === 'confirmed')) });
  },
  selectTab(e) { this._signature = ''; this.setData({ activeTab: e.currentTarget.dataset.tab, expandedId: '' }, () => this.filterOrders()); },
  toggleView() { this._signature = ''; this.setData({ ownerView: !this.data.ownerView, activeTab: 'all', expandedId: '' }, () => this.loadOrders()); },
  async advance(e) { await this.updateStatus(e.currentTarget.dataset.id, e.currentTarget.dataset.status); },
  cancel(e) {
    const order = this.data.orders.find(item => item.id === e.currentTarget.dataset.id);
    if (!order) return;
    wx.showModal({ title: '确认取消订单', content: '取消后无法恢复，需要重新下单。',
      confirmText: '取消订单', confirmColor: '#E1251B', cancelText: '再想想',
      success: result => { if (result.confirm) this.updateStatus(order.id, 'cancelled'); } });
  },
  remove(e) {
    const order = this.data.orders.find(item => item.id === e.currentTarget.dataset.id);
    if (!order || !order.canDelete) return;
    wx.showModal({ title: '删除订单', content: '删除后将不再显示这条订单记录，确定删除吗？',
      confirmText: '删除', confirmColor: '#E1251B',
      success: async result => {
        if (!result.confirm) return;
        try {
          wx.showLoading({ title: '正在删除', mask: true });
          await callShop('deleteOrder', { id: order.id });
          wx.showToast({ title: '订单已删除', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        } finally { wx.hideLoading(); }
        this._signature = '';
        await this.loadOrders({ silent: true });
      } });
  },
  async updateStatus(id, status) {
    try {
      wx.showLoading({ title: '正在更新', mask: true });
      await callShop('changeStatus', { id, status });
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' });
    } finally { wx.hideLoading(); }
    this._signature = '';
    await this.loadOrders({ silent: true });
  },
  confirmQuote(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '确认报价', content: '确认后将按报价代买，送达后线下付款。', confirmText: '确认报价', confirmColor: '#34765B',
      success: async result => {
        if (!result.confirm) return;
        try {
          wx.showLoading({ title: '提交中', mask: true });
          await callShop('confirmQuote', { id });
          wx.showToast({ title: '已确认，开始代买', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '确认失败', icon: 'none' });
        } finally { wx.hideLoading(); }
        this._signature = '';
        await this.loadOrders({ silent: true });
      } });
  },
  toggleDetail(e) {
    const id = e.currentTarget.dataset.id;
    this._signature = '';
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },
  copyWechat() {
    if (!this.data.ownerWechat) return;
    wx.setClipboardData({ data: this.data.ownerWechat, success: () => wx.showToast({ title: '微信号已复制', icon: 'none' }) });
  },
  goShop() { wx.switchTab({ url: '/pages/snack-home/index' }); }
});
