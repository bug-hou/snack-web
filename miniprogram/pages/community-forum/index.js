const { callShop } = require('../../utils/snack-cloud');
const { BOARDS, boardName, timeAgo, excerpt } = require('../../utils/snack-forum');

const PAGE_SIZE = 15;

function decorate(post) {
  const author = post.author || '邻居';
  return {
    id: post.id,
    title: post.title,
    excerpt: excerpt(post.content),
    images: post.images || [],
    author,
    initial: author.slice(0, 2),
    boardName: boardName(post.board),
    pinned: !!post.pinned,
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    timeText: timeAgo(post.createdAt)
  };
}

Page({
  data: {
    boards: BOARDS,
    board: 'all',
    posts: [],
    page: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: ''
  },

  onLoad() { this.load(true); },
  onShow() {
    // 从详情页或发帖页返回时静默刷新
    if (this._needRefresh) { this._needRefresh = false; this.load(true); }
  },
  async onPullDownRefresh() {
    this._busy = false;
    try { await this.load(true); }
    finally { wx.stopPullDownRefresh(); }
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.load(false);
  },

  async load(reset) {
    if (this._busy) return;
    this._busy = true;
    const page = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: !this.data.posts.length, error: '' } : { loadingMore: true });
    try {
      const list = await callShop('listPosts', { board: this.data.board, page }) || [];
      const decorated = list.map(decorate);
      this.setData({
        posts: reset ? decorated : this.data.posts.concat(decorated),
        page: page + 1,
        hasMore: list.length >= PAGE_SIZE,
        loading: false, loadingMore: false, error: ''
      });
    } catch (error) {
      if (!reset) wx.showToast({ title: error.message || '加载失败', icon: 'none' });
      this.setData({ loading: false, loadingMore: false,
        error: reset ? (error.message || '广场暂时无法访问') : '' });
    } finally { this._busy = false; }
  },

  selectBoard(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.board) return;
    this._busy = false;
    this.setData({ board: id, posts: [], page: 0, hasMore: true, loading: true, error: '' }, () => this.load(true));
  },
  retry() { this._busy = false; this.load(true); },
  openPost(e) {
    this._needRefresh = true;
    wx.navigateTo({ url: `/pages/community-forum-detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` });
  },
  goPublish() {
    this._needRefresh = true;
    wx.navigateTo({ url: '/pages/community-forum-post/index' });
  },

  onShareAppMessage() {
    return { title: '爱尚里 · 邻里广场', path: '/pages/community-forum/index' };
  }
});
