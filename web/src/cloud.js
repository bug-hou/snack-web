import ASSET_MAP from './assets-map.json';

/**
 * 商家后台与后端（server/）的通信层。
 * 早期走微信云开发（@cloudbase/js-sdk + snackAdmin 云函数 + SHOP_ADMIN_UID），
 * 现在改为请求自建后端 /api/admin/*，身份用 JWT 令牌。
 * 对外导出的 auth / invoke 语义保持不变，页面无需大改。
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').trim() || '/api';
const TOKEN_KEY = 'snackAdminToken';

// 仓库内的旧本地图片路径 → 云端地址，供商品编辑器的「预设图」使用
export const ASSETS = ASSET_MAP;

function readStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

let token = readStoredToken();
let role = '';

function setSession(nextToken, nextRole) {
  token = nextToken || '';
  role = nextRole || '';
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下 localStorage 不可用，退化成仅内存保存 */
  }
}

function decodeSub(value) {
  if (!value) return '';
  const parts = String(value).split('.');
  if (parts.length < 2) return '';
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(window.atob(payload));
    return json && json.sub ? String(json.sub) : '';
  } catch {
    return '';
  }
}

export function normalizeError(error) {
  const raw = (error && (error.message || error.errMsg)) || '';
  return new Error(raw || '网络请求失败，请稍后重试');
}

export function authErrorMessage(error) {
  const raw = (error && (error.message || error.errMsg)) || '';
  return raw || '登录失败，请检查账号与密码';
}

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    throw new Error('服务返回异常，请稍后重试');
  }

  if (!json || json.ok !== true) {
    const error = new Error((json && json.message) || '请求失败，请稍后重试');
    error.status = response.status;
    if (response.status === 401) {
      setSession('', '');
      error.message = '登录状态已失效，请重新登录';
    }
    throw error;
  }
  return json.data;
}

/* ---------------- 登录态 ---------------- */

export const auth = {
  /** 登录商家账号：必须是 admin 角色，否则拒绝进入后台 */
  async signIn({ username, password }) {
    const data = await request('POST', '/auth/login', { username, password });
    const user = data && data.user;
    if (!user || user.role !== 'admin') {
      setSession('', '');
      throw new Error('该账号不是商家管理员，请使用站长账号登录');
    }
    setSession(data.token, user.role);
    return user;
  },
  async getLoginState() {
    const uid = decodeSub(token);
    return uid ? { user: { uid, role } } : null;
  },
  async signOut() {
    setSession('', '');
  }
};

/* ---------------- action → REST 映射 ---------------- */

const ROUTES = {
  getDashboard: () => ['GET', '/admin/dashboard'],
  getStats: () => ['GET', '/admin/stats'],
  getOrders: (d) => ['GET', `/admin/orders${queryString({ page: d.page, status: d.status, type: d.type })}`],
  changeStatus: (d) => ['PATCH', `/admin/orders/${encodeURIComponent(d.id)}/status`, d],
  quoteOrder: (d) => ['POST', `/admin/orders/${encodeURIComponent(d.id)}/quote`, d],
  getUsers: (d) => ['GET', `/admin/users${queryString({ page: d.page, keyword: d.keyword })}`],
  getUserDetail: (d) => ['GET', `/admin/users/${encodeURIComponent(d.userId || d.openid)}`],
  listShares: (d) => ['GET', `/admin/shares${queryString({ page: d.page, status: d.status })}`],
  reviewShare: (d) => ['PATCH', `/admin/shares/${encodeURIComponent(d.id)}`, d],
  deleteShare: (d) => ['DELETE', `/admin/shares/${encodeURIComponent(d.id)}`],
  getProducts: () => ['GET', '/admin/products'],
  saveProduct: (d) => ['POST', '/admin/products', d],
  deleteProduct: (d) => ['DELETE', '/admin/products', d],
  listPosts: (d) => ['GET', `/admin/posts${queryString({ page: d.page, board: d.board, keyword: d.keyword })}`],
  deletePost: (d) => ['DELETE', `/admin/posts/${encodeURIComponent(d.id)}`],
  listComments: (d) => ['GET', `/admin/comments${queryString({ postId: d.postId })}`],
  deleteComment: (d) => ['DELETE', `/admin/comments/${encodeURIComponent(d.id)}`],
  saveSettings: (d) => ['PUT', '/admin/settings', d]
};

export async function invoke(action, data = {}) {
  const route = ROUTES[action];
  if (!route) throw new Error(`未知操作：${action}`);
  const [method, path, body] = route(data);
  return request(method, path, body);
}

/* ---------------- 图片 ---------------- */

export const IMAGE_MAX_BYTES = 12 * 1024 * 1024; // 原始图片上限，压缩后再上传
export const IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024; // 落盘上限
const MAX_EDGE = 1600;

function randomName() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map((v) => v.toString(16).padStart(2, '0')).join('');
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob(resolve, 'image/jpeg', quality);
    else resolve(null);
  });
}

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await window.createImageBitmap(file); } catch { /* 走 img 兜底 */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解析失败，请换一张 JPG / PNG / WebP 图片')); };
    img.src = url;
  });
}

// 手机直出照片普遍 4~10MB，先按长边缩放 + JPEG 压缩
async function compress(file) {
  const source = await decode(file);
  const width = source.width || 0;
  const height = source.height || 0;
  if (!width || !height) throw new Error('图片尺寸读取失败，请换一张图片');
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持图片处理，请更换浏览器');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  let quality = 0.86;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > IMAGE_UPLOAD_MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await toBlob(canvas, quality);
  }
  if (!blob) throw new Error('图片处理失败，请换一张图片重试');
  if (blob.size > IMAGE_UPLOAD_MAX_BYTES) throw new Error('图片压缩后仍超过 3MB，请换一张更小的图片');
  return new File([blob], `${randomName()}.jpg`, { type: 'image/jpeg' });
}

/** 上传商品图，返回 /uploads/products/<file> 地址 */
export async function uploadProductImage(file, onProgress) {
  if (!file) throw new Error('请先选择图片');
  if (!String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  if (file.size > IMAGE_MAX_BYTES) throw new Error(`原始图片不能超过 ${IMAGE_MAX_BYTES / 1024 / 1024}MB`);
  if (typeof onProgress === 'function') onProgress(0.1);

  const prepared = await compress(file);
  if (typeof onProgress === 'function') onProgress(0.5);

  const form = new FormData();
  // dir 必须先于 file 追加：后端 multer 解析 file 时要读 req.body.dir 决定落盘目录
  form.append('dir', 'products');
  form.append('file', prepared, prepared.name);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}/upload`, { method: 'POST', headers, body: form });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }
  const json = await response.json().catch(() => null);
  if (!json || json.ok !== true) {
    if (response.status === 401) setSession('', '');
    throw new Error((json && json.message) || '图片上传失败，请重试');
  }
  if (typeof onProgress === 'function') onProgress(1);
  return json.data.url;
}

/**
 * 后端现在直接返回可访问的 /uploads/ 地址，无需再换临时链接。
 * 历史数据里残留的 cloud:// 无法解析，返回空串（界面回退到文字占位）。
 */
export async function resolveImages(sources) {
  const output = {};
  (sources || []).forEach((src) => {
    if (typeof src !== 'string' || !src) return;
    const mapped = ASSET_MAP[src] || src;
    output[src] = mapped.startsWith('cloud://') ? '' : mapped;
  });
  return output;
}

export async function resolveImage(src) {
  if (!src) return '';
  const mapped = ASSET_MAP[src] || src;
  if (mapped.startsWith('cloud://')) return '';
  return mapped;
}
