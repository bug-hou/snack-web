const { callShop } = require('../../utils/snack-cloud');

const money = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);

Page({
  data: { id: '', item: null, loading: true, error: '' },
  onLoad(options) {
    if (!options || !options.id) { this.setData({ loading: false, error: '物品不存在' }); return; }
    this.setData({ id: options.id });
    this.loadDetail();
  },
  async loadDetail() {
    this.setData({ loading: true, error: '' });
    try {
      const item = await callShop('getShare', { id: this.data.id });
      this.setData({ item: { ...item, price: money(item.priceCents) }, loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '加载失败，请重试' });
    }
  },
  onShareAppMessage() {
    const item = this.data.item;
    return { title: item ? `${item.modeText}｜${item.title}` : '邻里闲置分享', path: `/pages/community-share-detail/index?id=${this.data.id}` };
  },
  async changeStatus(status, tip) {
    wx.showModal({
      title: '确认操作', content: tip, confirmText: '确定', confirmColor: '#34765B',
      success: async result => {
        if (!result.confirm) return;
        try {
          wx.showLoading({ title: '处理中', mask: true });
          await callShop('updateShare', { id: this.data.id, status });
          wx.hideLoading();
          wx.showToast({ title: '已更新', icon: 'success' });
          this.loadDetail();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    });
  },
  markTaken() { this.changeStatus('taken', '标记为已转出后，物品将从邻里闲置列表中移除。'); },
  markOff() { this.changeStatus('off', '下架后其他邻居将看不到这件物品。'); },
  relist() { this.changeStatus('approved', '重新上架后立即对邻居公开，确认吗？'); }
});
