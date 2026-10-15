const { callShop } = require('../../utils/snack-cloud');
const { boardName, timeAgo } = require('../../utils/snack-forum');

function decoratePost(post) {
  const author = post.author || '邻居';
  return {
    id: post.id,
    boardName: boardName(post.board),
    title: post.title,
    content: post.content,
    images: post.images || [],
    author,
    initial: author.slice(0, 2),
    timeText: timeAgo(post.createdAt),
    likeCount: post.likeCount || 0,
    liked: !!post.liked,
    commentCount: post.commentCount || 0,
    isMine: !!post.isMine
  };
}
function decorateComment(comment) {
  const author = comment.author || '邻居';
  return {
    id: comment.id,
    content: comment.content,
    author,
    initial: author.slice(0, 2),
    timeText: timeAgo(comment.createdAt),
    isMine: !!comment.isMine
  };
}

Page({
  data: {
    id: '', post: null, comments: [],
    draft: '', sending: false,
    loading: true, error: ''
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.loadAll();
  },

  async loadAll() {
    if (!this.data.id) { this.setData({ loading: false, error: '帖子不存在' }); return; }
    this.setData({ loading: true, error: '' });
    try {
      const [post, comments] = await Promise.all([
        callShop('getPost', { id: this.data.id }),
        callShop('listComments', { postId: this.data.id })
      ]);
      this.setData({ post: decoratePost(post), comments: (comments || []).map(decorateComment), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '帖子加载失败' });
    }
  },

  async previewImage(e) {
    const current = e.currentTarget.dataset.src;
    const images = this.data.post.images || [];
    try {
      // 云存储 fileID 不能直接预览，先换取临时访问链接
      const resolved = await wx.cloud.getTempFileURL({ fileList: images });
      const urls = (resolved.fileList || []).map(item => item.tempFileURL || item.fileID);
      wx.previewImage({ current: urls[images.indexOf(current)] || urls[0], urls });
    } catch (error) {
      wx.previewImage({ current, urls: images });
    }
  },

  async toggleLike() {
    const post = this.data.post;
    if (!post || this._liking) return;
    this._liking = true;
    try {
      const result = await callShop('toggleLike', { id: post.id });
      this.setData({ ['post.liked']: result.liked, ['post.likeCount']: result.likeCount });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally { this._liking = false; }
  },

  onDraft(e) { this.setData({ draft: e.detail.value }); },

  async submitComment() {
    const content = this.data.draft.trim();
    if (!content) { wx.showToast({ title: '请先输入评论内容', icon: 'none' }); return; }
    if (this.data.sending) return;
    this.setData({ sending: true });
    try {
      const comment = await callShop('createComment', { postId: this.data.id, content });
      this.setData({
        comments: this.data.comments.concat(decorateComment(comment)),
        draft: '',
        ['post.commentCount']: (this.data.post.commentCount || 0) + 1
      });
    } catch (error) {
      wx.showToast({ title: error.message || '评论失败', icon: 'none' });
    } finally { this.setData({ sending: false }); }
  },

  removeComment(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除评论', content: '删除后其他邻居将无法看到这条评论。',
      success: async result => {
        if (!result.confirm) return;
        try {
          await callShop('deleteComment', { id });
          this.setData({
            comments: this.data.comments.filter(item => item.id !== id),
            ['post.commentCount']: Math.max(0, (this.data.post.commentCount || 0) - 1)
          });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  removePost() {
    wx.showModal({
      title: '删除帖子', content: '帖子与全部评论都会被删除，且无法恢复。',
      success: async result => {
        if (!result.confirm) return;
        try {
          wx.showLoading({ title: '正在删除', mask: true });
          await callShop('deletePost', { id: this.data.id });
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    const post = this.data.post;
    return {
      title: post ? `邻里广场 · ${post.title}` : '爱尚里 · 邻里广场',
      path: `/pages/community-forum-detail/index?id=${this.data.id}`
    };
  }
});
