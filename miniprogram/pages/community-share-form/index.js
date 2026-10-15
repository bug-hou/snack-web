const { callShop } = require('../../utils/snack-cloud');

const CONDITIONS = [{ value: 'new', label: '几乎全新' }, { value: 'like', label: '九成新' }, { value: 'used', label: '七成新' }, { value: 'worn', label: '有使用痕迹' }];
const MODES = [{ value: 'sale', label: '二手转让' }, { value: 'giveaway', label: '免费分享' }];
const IMAGE_TYPES = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

function randomId() {
  let id = '';
  while (id.length < 32) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

Page({
  data: {
    conditions: CONDITIONS, conditionIndex: 0,
    modes: MODES, modeIndex: 0,
    title: '', description: '', meetup: '', price: '',
    images: [], uploading: false, submitting: false, error: ''
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  pickCondition(e) { this.setData({ conditionIndex: Number(e.detail.value) }); },
  pickMode(e) { this.setData({ modeIndex: Number(e.currentTarget.dataset.index) }); },
  chooseImage() {
    if (this.data.images.length >= 3) { wx.showToast({ title: '最多3张图片', icon: 'none' }); return; }
    wx.chooseMedia({
      count: 3 - this.data.images.length, mediaType: ['image'], sizeType: ['compressed'],
      success: async result => {
        const files = (result.tempFiles || []).slice(0, 3 - this.data.images.length);
        this.setData({ uploading: true, error: '' });
        try {
          for (const file of files) {
            // chooseMedia 不返回 fileType，从临时文件路径提取扩展名
            const matched = String(file.tempFilePath || '').toLowerCase().match(/\.(jpe?g|png|webp)(\?|$)/);
            const name = matched ? (matched[1] === 'jpeg' ? 'jpg' : matched[1]) : 'jpg';
            if (file.size > IMAGE_MAX_BYTES) throw new Error('单张图片不能超过 3MB');
            const uploaded = await wx.cloud.uploadFile({ cloudPath: `community/${randomId()}.${name}`, filePath: file.tempFilePath });
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
  async submit() {
    if (this.data.submitting || this.data.uploading) return;
    const { title, description, meetup, price, images, modeIndex, conditionIndex } = this.data;
    if (!title.trim() || !description.trim() || !meetup.trim()) {
      this.setData({ error: '请填写物品名称、描述和交接地点' }); return;
    }
    const mode = MODES[modeIndex].value;
    let priceCents = 0;
    if (mode === 'sale') {
      priceCents = Math.round(Number(price) * 100);
      if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 1000000) {
        this.setData({ error: '请填写有效的转让价格' }); return;
      }
    }
    this.setData({ submitting: true, error: '' });
    try {
      wx.showLoading({ title: '正在发布', mask: true });
      await callShop('createShare', { title: title.trim(), description: description.trim(), meetup: meetup.trim(),
        condition: CONDITIONS[conditionIndex].value, mode, priceCents, images });
      wx.hideLoading();
      wx.showToast({ title: '已发布，邻居可看到', icon: 'success' });
      wx.redirectTo({ url: '/pages/community-share/index' });
    } catch (error) {
      wx.hideLoading();
      this.setData({ error: error.message || '发布失败，请重试' });
    } finally { this.setData({ submitting: false }); }
  }
});
