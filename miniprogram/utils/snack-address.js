const { callShop } = require('./snack-cloud');
const { read, write } = require('./snack-cache');
const KEY = 'snack-selected-address-id-v1';
const CACHE_KEY = 'addresses';

function selectAddress(id) {
  if (typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)) wx.setStorageSync(KEY, id);
  else wx.removeStorageSync(KEY);
}

function resolve(list) {
  const id = wx.getStorageSync(KEY);
  const selected = list.find(item => item.id === id) || list[0] || null;
  if (selected && selected.id !== id) selectAddress(selected.id);
  if (!selected) selectAddress('');
  return { list, selected };
}

// 同步读取本地缓存的地址，用于首屏立即展示。
function peekAddresses() {
  const list = read(CACHE_KEY);
  return Array.isArray(list) ? resolve(list) : null;
}

async function getAddresses() {
  try {
    const list = await callShop('listAddresses');
    if (!Array.isArray(list)) throw new Error('地址暂时无法加载');
    write(CACHE_KEY, list);
    return resolve(list);
  } catch (error) {
    const cached = peekAddresses();
    if (cached) return cached;
    throw error;
  }
}

module.exports = { getAddresses, peekAddresses, selectAddress };
