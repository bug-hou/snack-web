import { invoke } from './cloud';
import { read, write, remove } from './cache';

/* ---------- 店铺公开设置 ---------- */

const CONTEXT_KEY = 'shop-context';

// 仅缓存对所有顾客公开的店铺设置，不缓存身份信息
export function peekContext() {
  const cached = read(CONTEXT_KEY);
  return cached && typeof cached === 'object' ? cached : null;
}

export async function loadContext() {
  const context = await invoke('getContext');
  const { isOwner, ownOpenid, ...publicPart } = context || {};
  write(CONTEXT_KEY, publicPart);
  return context;
}

/* ---------- 收货地址 ---------- */

const ADDRESS_KEY = 'snack-selected-address-id-v1';
const ADDRESS_CACHE = 'addresses';

function selectAddress(id) {
  if (typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)) localStorage.setItem(ADDRESS_KEY, id);
  else remove(ADDRESS_KEY);
}

function resolve(list) {
  const id = localStorage.getItem(ADDRESS_KEY) || '';
  const selected = list.find(item => item.id === id) || list[0] || null;
  if (selected && selected.id !== id) selectAddress(selected.id);
  if (!selected) selectAddress('');
  return { list, selected };
}

export function peekAddresses() {
  const list = read(ADDRESS_CACHE);
  return Array.isArray(list) ? resolve(list) : null;
}

export async function getAddresses() {
  try {
    const list = await invoke('listAddresses');
    if (!Array.isArray(list)) throw new Error('地址暂时无法加载');
    write(ADDRESS_CACHE, list);
    return resolve(list);
  } catch (error) {
    const cached = peekAddresses();
    if (cached) return cached;
    throw error;
  }
}

export { selectAddress };

/* ---------- 个人资料 ---------- */

const PROFILE_KEY = 'user-profile';
const normalize = data => ({
  nickName: data && typeof data.nickName === 'string' ? data.nickName : '',
  avatarUrl: data && typeof data.avatarUrl === 'string' ? data.avatarUrl : ''
});

export function peekProfile() {
  return normalize(read(PROFILE_KEY));
}

export async function loadProfile() {
  const data = normalize(await invoke('getProfile'));
  write(PROFILE_KEY, data);
  return data;
}

export async function saveProfile(input) {
  const data = normalize(await invoke('saveProfile', {
    nickName: input && input.nickName ? input.nickName : '',
    avatarUrl: input && input.avatarUrl ? input.avatarUrl : ''
  }));
  write(PROFILE_KEY, data);
  return data;
}
