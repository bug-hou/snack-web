const { callShop } = require('../../utils/snack-cloud');

const money = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
const TONES = ['peach', 'sage', 'butter'];

Page({
  data: {
    scope: 'all', tabs: [{ id: 'all', name: '邻里闲置' }, { id: 'mine', name: '我的发布' }],
    list: [], loading: true, error: ''
  },
  onShow() { this.loadShares(); },
  async onPullDownRefresh() { await this.loadShares(); wx.stopPullDownRefresh(); },
  async loadShares() {
    this.setData({ loading: true, error: '' });
    try {
      const list = await callShop('listShares', { scope: this.data.scope });
      this.setData({ list: list.map((item, index) => ({
        id: item.id, title: item.title, description: item.description,
        conditionText: item.conditionText, modeText: item.modeText,
        priceText: item.mode === 'sale' ? `¥${money(item.priceCents)}` : '免费分享',
        meetup: item.meetup, statusText: item.statusText, isMine: item.isMine,
        cover: item.images && item.images.length ? item.images[0] : '',
        initials: (item.title || '闲置').slice(0, 2),
        tone: TONES[index % TONES.length]
      })), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '加载失败，请下拉重试' });
    }
  },
  selectTab(e) { this.setData({ scope: e.currentTarget.dataset.scope }, () => this.loadShares()); },
  openDetail(e) { wx.navigateTo({ url: `/pages/community-share-detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  goPublish() { wx.navigateTo({ url: '/pages/community-share-form/index' }); }
});
