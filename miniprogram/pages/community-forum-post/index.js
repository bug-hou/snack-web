const { callShop } = require('../../utils/snack-cloud');
const { POST_BOARDS } = require('../../utils/snack-forum');

const IMAGE_TYPES = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

function randomId() {
  let id = '';
  while (id.length < 32) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

Page({
  data: {
    boards: POST_BOARDS,
    board: 'chat',
    title: '', content: '', images: [],
    uploading: false, submitting: false, error: ''
  },

  pickBoard(e) { this.setData({ board: e.currentTarget.dataset.id }); },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onContent(e) { this.setData({ content: e.detail.value }); },

  chooseImage() {
    if (this.data.images.length >= 3) { wx.showToast({ title: '最多 3 张图片', icon: 'none' }); return; }
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async result => {
        const files = (result.tempFiles || []).slice(0, 3 - this.data.images.length);
        if (!files.length) return;
        this.setData({ uploading: true, error: '' });
        try {
          for (const file of files) {
            const matched = String(file.tempFilePath || '').toLowerCase().match(/\.(jpe?g|png|webp)(\?|$)/);
            const name = matched ? (matched[1] === 'jpeg' ? 'jpg' : matched[1]) : 'jpg';
            if (file.size > IMAGE_MAX_BYTES) throw new Error('单张图片不能超过 3MB');
            const uploaded = await wx.cloud.uploadFile({ cloudPath: `forum/${randomId()}.${IMAGE_TYPES[name]}`, filePath: file.tempFilePath });
            if (!uploaded || !uploaded.fileID) throw new Error('图片上传失败，请重试');
            this.setData({ images: this.data.images.concat(uploaded.fileID) });
          }
        } catch (error) {
          this.setData({ error: error.message || '图片上传失败，请重试' });
        } finally { this.setData({ uploading: false }); }
      }
    });
  },
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ images: this.data.images.filter((_, i) => i !== index) });
  },

  goBack() {
    if (this.data.title || this.data.content || this.data.images.length) {
      wx.showModal({
        title: '放弃这篇帖子', content: '已填写的内容不会保存。',
        success: result => { if (result.confirm) wx.navigateBack(); }
      });
      return;
    }
    wx.navigateBack();
  },

  async submit() {
    if (this.data.submitting || this.data.uploading) return;
    const { board, title, content, images } = this.data;
    if (!title.trim()) { this.setData({ error: '请先填写标题' }); return; }
    if (!content.trim()) { this.setData({ error: '请先填写正文内容' }); return; }
    this.setData({ submitting: true, error: '' });
    try {
      wx.showLoading({ title: '正在发布', mask: true });
      await callShop('createPost', { board, title: title.trim(), content: content.trim(), images });
      wx.hideLoading();
      wx.showToast({ title: '已发布到广场', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      wx.hideLoading();
      this.setData({ error: error.message || '发布失败，请重试' });
    } finally { this.setData({ submitting: false }); }
  }
});
