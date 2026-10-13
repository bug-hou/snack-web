const { callShop } = require('./snack-cloud');
const KEY = 'snack-selected-address-id-v1';

function selectAddress(id) {
  if (typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)) wx.setStorageSync(KEY, id);
  else wx.removeStorageSync(KEY);
}

async function getAddresses() {
  const list = await callShop('listAddresses');
  if (!Array.isArray(list)) throw new Error('地址暂时无法加载');
  const id = wx.getStorageSync(KEY);
  const selected = list.find(item => item.id === id) || list[0] || null;
  if (selected && selected.id !== id) selectAddress(selected.id);
  if (!selected) selectAddress('');
  return { list, selected };
}

module.exports = { getAddresses, selectAddress };
