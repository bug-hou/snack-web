const { callShop } = require('../../utils/snack-cloud');
const { getAddresses, selectAddress } = require('../../utils/snack-address');

const emptyForm = () => ({ id: '', label: '家', recipient: '', phone: '', building: '', room: '', contactPreference: 'knock', pickupPhoneLast4: '' });
const CONTACT_TEXT = { knock: '送达请敲门', call: '送达先打电话', no_knock: '送达不要敲门' };
const decorate = list => list.map(item => ({ ...item, contactText: CONTACT_TEXT[item.contactPreference] || '' }));
Page({
  data: {
    list: [], selectedId: '', loading: true, saving: false, error: '', editing: false,
    form: emptyForm(), buildings: ['16', '17', '18'], preferences: [
      { value: 'knock', label: '请敲门' }, { value: 'call', label: '到达打电话' },
      { value: 'no_knock', label: '不要敲门' }
    ]
  },
  onLoad(options) {
    const from = options && options.from;
    this._from = from === 'checkout' || from === 'errand' ? from : '';
  },
  onShow() { this.loadAddresses(); },
  async loadAddresses() {
    this.setData({ loading: true, error: '' });
    try {
      const { list, selected } = await getAddresses();
      this.setData({ list: decorate(list), selectedId: selected ? selected.id : '', loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '地址加载失败，请重试' });
    }
  },
  choose(e) {
    selectAddress(e.currentTarget.dataset.id);
    this.setData({ selectedId: e.currentTarget.dataset.id });
    if (this._from) wx.navigateBack();
    else wx.showToast({ title: '已设为常用地址', icon: 'none' });
  },
  add() { this.setData({ editing: true, form: emptyForm(), error: '' }); },
  edit(e) {
    const address = this.data.list.find(item => item.id === e.currentTarget.dataset.id);
    if (!address) return;
    const { contactText, ...rest } = address;
    this.setData({ editing: true, form: { ...emptyForm(), ...rest }, error: '' });
  },
  closeForm() { this.setData({ editing: false, form: emptyForm(), error: '' }); },
  update(e) {
    const key = e.currentTarget.dataset.key;
    if (['recipient', 'phone', 'room', 'label', 'pickupPhoneLast4'].includes(key)) this.setData({ [`form.${key}`]: e.detail.value });
  },
  building(e) { this.setData({ 'form.building': e.currentTarget.dataset.value }); },
  preference(e) { this.setData({ 'form.contactPreference': e.currentTarget.dataset.value }); },
  async save() {
    if (this.data.saving) return;
    const f = this.data.form;
    if (!f.recipient.trim() || !/^1[3-9]\d{9}$/.test(f.phone.trim())) {
      this.setData({ error: '请填写姓名和正确的手机号码' }); return;
    }
    if (!this.data.buildings.includes(f.building) || !/^[0-9A-Za-z\u4e00-\u9fa5-]{1,20}$/.test(f.room.trim())) {
      this.setData({ error: '请选择楼栋并填写门牌号' }); return;
    }
    const pickupPhoneLast4 = (f.pickupPhoneLast4 || '').trim();
    if (pickupPhoneLast4 && !/^\d{4}$/.test(pickupPhoneLast4)) {
      this.setData({ error: '取件手机尾号需为4位数字' }); return;
    }
    this.setData({ saving: true, error: '' });
    try {
      const saved = await callShop('saveAddress', { ...f, recipient: f.recipient.trim(), phone: f.phone.trim(), room: f.room.trim(), pickupPhoneLast4 });
      selectAddress(saved.id);
      this.setData({ editing: false, form: emptyForm() });
      await this.loadAddresses();
      if (this._from) wx.navigateBack();
      else wx.showToast({ title: '地址已保存', icon: 'success' });
    } catch (error) { this.setData({ error: error.message || '保存失败，请重试' }); }
    finally { this.setData({ saving: false }); }
  },
  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '删除地址', content: '确定删除这条收货地址吗？已提交的订单不会受到影响。',
      success: async result => {
        if (!result.confirm) return;
        try {
          await callShop('deleteAddress', { id });
          if (this.data.selectedId === id) selectAddress('');
          await this.loadAddresses();
        } catch (error) { wx.showToast({ title: error.message || '删除失败', icon: 'none' }); }
      } });
  }
});
