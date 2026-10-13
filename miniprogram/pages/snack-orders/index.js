const { callShop } = require('../../utils/snack-cloud');
const NEXT_STATUS = { pending: 'processing', processing: 'packed', packed: 'delivering', delivering: 'completed', confirmed: 'packed' };
const NEXT_TEXT = { pending: '开始处理', processing: '配货完成', packed: '开始配送', delivering: '确认送达', confirmed: '配货完成' };
const CONTACT_LABELS = { knock: '请敲门', call: '到达后打电话', no_knock: '不要敲门' };
const PROGRESS = { pending: 0, processing: 1, confirmed: 1, packed: 2, delivering: 3, completed: 4, cancelled: -1 };

Page({
  data: { orders: [], filteredOrders: [], activeTab: 'all', tabs: [
    { id: 'all', name: '全部' }, { id: 'pending', name: '待处理' },
    { id: 'processing', name: '处理中' }, { id: 'packed', name: '已配货' },
    { id: 'delivering', name: '配送中' }, { id: 'completed', name: '已完成' }
  ], isOwner: false, ownerView: false, loading: true, error: '' },
  onShow() { this.loadOrders(); },
  async onPullDownRefresh() { await this.loadOrders(); wx.stopPullDownRefresh(); },
  async loadOrders() {
    this.setData({ loading: true, error: '' });
    try {
      const context = await callShop('getContext');
      const ownerView = this.data.ownerView && !!context.isOwner;
      const list = await callShop('listOrders', { asOwner: ownerView });
      const orders = list.map(order => ({ ...order,
        dateText: new Date(order.createdAt).toLocaleString('zh-CN'),
        nextStatus: NEXT_STATUS[order.status] || '',
        nextText: NEXT_TEXT[order.status] || '',
        contactText: CONTACT_LABELS[order.contactPreference] || '请敲门',
        progress: PROGRESS[order.status],
        canCancel: !ownerView && order.status === 'pending',
        lines: (order.items || []).map(item => ({ ...item, subtotal: (item.subtotalCents / 100).toFixed(2) }))
      }));
      this.setData({ orders, isOwner: !!context.isOwner, ownerView, loading: false });
      this.filterOrders();
    } catch (error) {
      this.setData({ loading: false, error: '订单暂时无法加载，下拉刷新试试。', orders: [], filteredOrders: [] });
    }
  },
  filterOrders() {
    const { orders, activeTab } = this.data;
    this.setData({ filteredOrders: activeTab === 'all' ? orders : orders.filter(order => order.status === activeTab || (activeTab === 'processing' && order.status === 'confirmed')) });
  },
  selectTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }, () => this.filterOrders()); },
  toggleView() { this.setData({ ownerView: !this.data.ownerView, activeTab: 'all' }, () => this.loadOrders()); },
  advance(e) { this.updateStatus(e.currentTarget.dataset.id, e.currentTarget.dataset.status); },
  cancel(e) {
    wx.showModal({ title: '取消订单', content: '待确认订单取消后无法恢复，确定取消吗？',
      success: result => { if (result.confirm) this.updateStatus(e.currentTarget.dataset.id, 'cancelled'); } });
  },
  async updateStatus(id, status) {
    try {
      wx.showLoading({ title: '正在更新', mask: true });
      await callShop('changeStatus', { id, status });
      await this.loadOrders();
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' });
      await this.loadOrders();
    } finally { wx.hideLoading(); }
  },
  goShop() { wx.switchTab({ url: '/pages/snack-home/index' }); }
});
