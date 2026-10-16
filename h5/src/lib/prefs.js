/**
 * 记住上次填过的内容，让下一次登记只需要点几下。
 * 只缓存「非敏感、可复现」的选择：站点、联系人、送达偏好、交接地点、板块、常用商品名。
 * 不缓存取件码、订单内容等一次性信息。
 */
import { read, write } from './cache';

const KEY = 'aishangli-prefs-v1';

const EMPTY = {
  station: '',
  recipient: '',
  phone: '',
  contactPreference: 'knock',
  building: '',
  meetup: '',
  board: 'chat',
  purchaseItems: []
};

export function prefs() {
  const cached = read(KEY);
  return { ...EMPTY, ...(cached && typeof cached === 'object' ? cached : {}) };
}

export function savePrefs(patch) {
  const next = { ...prefs(), ...patch };
  write(KEY, next);
  return next;
}

/** 记住买过的商品名，最多保留 8 个，最近用过的排前面 */
export function rememberPurchaseItems(names) {
  const clean = (names || [])
    .map(name => String(name || '').trim())
    .filter(name => name.length >= 1 && name.length <= 20);
  if (!clean.length) return prefs().purchaseItems;

  const merged = clean.concat(prefs().purchaseItems);
  const seen = new Set();
  const next = [];
  merged.forEach(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    next.push(name);
  });
  return savePrefs({ purchaseItems: next.slice(0, 8) }).purchaseItems;
}
