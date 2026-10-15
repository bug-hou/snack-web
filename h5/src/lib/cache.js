// 与小程序 utils/snack-cache.js 同构：本地缓存，失败不影响主流程
const PREFIX = 'snack-cache-v1:';

export function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
    return entry.value;
  } catch (e) { return null; }
}

export function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch (e) { /* 缓存失败忽略 */ }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}
