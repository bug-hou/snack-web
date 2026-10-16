const { peekProfile, loadProfile, saveProfile } = require('../../utils/snack-profile');
const { uploadImage } = require('../../utils/snack-cloud');

const initialOf = nickName => (nickName ? nickName.slice(0, 1) : '里');

Page({
  data: { nickName: '', avatarUrl: '', initial: '里', uploading: false, saving: false, error: '' },
  onLoad() {
    const cached = peekProfile();
    this.setData({ nickName: cached.nickName, avatarUrl: cached.avatarUrl, initial: initialOf(cached.nickName) });
    this.refresh();
  },
  async refresh() {
    try {
      const profile = await loadProfile();
      this.setData({ nickName: profile.nickName, avatarUrl: profile.avatarUrl, initial: initialOf(profile.nickName) });
    } catch (error) {
      // 拉取失败时保留缓存里的资料，不影响编辑
    }
  },
  async onChooseAvatar(event) {
    const file = event.detail && event.detail.avatarUrl;
    if (!file || this.data.uploading) return;
    this.setData({ uploading: true, error: '' });
    try {
      // 上传到自建后端，返回 /uploads/avatar/<file> 或 COS 地址
      const url = await uploadImage(file, 'avatar');
      this.setData({ avatarUrl: url, uploading: false });
    } catch (error) {
      this.setData({ uploading: false, error: '头像上传失败，请重试' });
    }
  },
  removeAvatar() { this.setData({ avatarUrl: '' }); },
  onNickName(event) {
    const nickName = event.detail.value;
    this.setData({ nickName, initial: initialOf(nickName.trim()) });
  },
  async save() {
    if (this.data.saving || this.data.uploading) return;
    const nickName = (this.data.nickName || '').trim();
    if (nickName && nickName.length < 2) {
      this.setData({ error: '昵称至少 2 个字' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await saveProfile({ nickName, avatarUrl: this.data.avatarUrl });
      wx.showToast({ title: '资料已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      this.setData({ saving: false, error: error.message || '保存失败，请稍后重试' });
    }
  }
});
