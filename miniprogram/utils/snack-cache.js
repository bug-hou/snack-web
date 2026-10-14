const PREFIX = 'snack-cache-v1:';

function read(key, maxAgeMs) {
  try {
    const entry = wx.getStorageSync(PREFIX + key);
    if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
    if (maxAgeMs && Date.now() - entry.at > maxAgeMs) return null;
    return entry.value;
  } catch (e) { return null; }
}

function write(key, value) {
  try { wx.setStorageSync(PREFIX + key, { at: Date.now(), value }); } catch (e) { /* 缓存失败不影响主流程 */ }
}

function remove(key) {
  try { wx.removeStorageSync(PREFIX + key); } catch (e) { /* ignore */ }
}

module.exports = { read, write, remove };
