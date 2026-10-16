/**
 * 与小程序端 utils/snack-cloud.js 使用同一套协议：
 * 请求 { action, data } → 响应 { ok, message, data }
 *
 * 早期实现走微信云开发（@cloudbase/js-sdk + 匿名登录），
 * 现在改为请求自建后端（server/，部署在 Lighthouse）。
 * 对外导出的函数名与语义保持不变，页面无需改动。
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').trim() || '/api';

// 同源部署（Nginx / EdgeOne 反代 /api）时无需额外配置
export const CONFIG_ERROR = '';

const TOKEN_KEY = 'aishangli.token';

function readStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

let token = readStoredToken();

function setToken(next) {
  token = next || '';
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下 localStorage 不可用，退化成仅内存保存 */
  }
}

export function getToken() {
  return token;
}

/** 解析 JWT 里的 sub（用户 ID），不校验签名，只用于本地判断登录态 */
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

export function errorText(error) {
  const raw = (error && (error.message || error.errMsg)) || '';
  if (!raw) return '网络请求失败，请稍后重试';
  return String(raw);
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
    const error = new Error((json && json.message) || '服务暂不可用，请稍后重试');
    error.code = (json && json.code) || '';
    error.status = response.status;
    if (response.status === 401) {
      // 令牌过期或被吊销：清掉本地状态，让上层回到登录页
      setToken('');
      error.message = '登录状态已失效，请重新登录';
    }
    throw error;
  }
  return json.data;
}

/* ---------------- action → REST 路由映射 ---------------- */

const ROUTES = {
  getContext: () => ['GET', '/settings'],
  getProfile: () => ['GET', '/profile'],
  saveProfile: (data) => ['PUT', '/profile', data],
  getCatalog: () => ['GET', '/products'],

  listAddresses: () => ['GET', '/addresses'],
  saveAddress: (data) => ['POST', '/addresses', data],
  deleteAddress: (data) => ['DELETE', `/addresses/${encodeURIComponent(data.id)}`],

  createOrder: (data) => ['POST', '/orders', data],
  createServiceOrder: (data) => ['POST', '/orders', data],
  listOrders: () => ['GET', '/orders'],
  deleteOrder: (data) => ['DELETE', `/orders/${encodeURIComponent(data.id)}`],
  changeStatus: (data) => ['PATCH', `/orders/${encodeURIComponent(data.id)}/status`, data],
  confirmQuote: (data) => ['POST', `/orders/${encodeURIComponent(data.id)}/confirm-quote`],
  quoteServiceOrder: (data) => ['POST', `/orders/${encodeURIComponent(data.id)}/quote`, data],

  listShares: (data) => ['GET', `/shares${queryString({ scope: data.scope })}`],
  getShare: (data) => ['GET', `/shares/${encodeURIComponent(data.id)}`],
  createShare: (data) => ['POST', '/shares', data],
  updateShare: (data) => ['PATCH', `/shares/${encodeURIComponent(data.id)}`, data],

  listPosts: (data) => ['GET', `/forum/posts${queryString({ board: data.board, page: data.page })}`],
  getPost: (data) => ['GET', `/forum/posts/${encodeURIComponent(data.id)}`],
  createPost: (data) => ['POST', '/forum/posts', data],
  deletePost: (data) => ['DELETE', `/forum/posts/${encodeURIComponent(data.id)}`],
  toggleLike: (data) => ['POST', `/forum/posts/${encodeURIComponent(data.id)}/like`],

  listComments: (data) => ['GET', `/forum/comments${queryString({ postId: data.postId })}`],
  createComment: (data) => ['POST', '/forum/comments', data],
  deleteComment: (data) => ['DELETE', `/forum/comments/${encodeURIComponent(data.id)}`]
};

export async function invoke(action, data = {}) {
  const route = ROUTES[action];
  if (!route) throw new Error(`未知操作：${action}`);
  const [method, path, body] = route(data);
  const result = await request(method, path, body);

  // getContext 在云函数版本里额外返回 isOwner / ownOpenid，这里补齐以兼容页面
  if (action === 'getContext') {
    const { me, ...rest } = result || {};
    return { ...rest, isOwner: false, ownOpenid: (me && me.id) || '' };
  }
  return result;
}

/* ---------------- 登录态 ---------------- */

export async function currentUid() {
  return decodeSub(token);
}

/**
 * 云开发版本这里是「匿名登录」。
 * 改用自建账号体系后不再有匿名身份：有令牌即已登录，否则需要注册或登录。
 */
export async function ensureLogin() {
  return Boolean(decodeSub(token));
}

export async function signInWithPassword(username, password) {
  const data = await request('POST', '/auth/login', { username, password });
  setToken(data && data.token);
  const uid = await currentUid();
  if (!uid) throw new Error('已登录但未取到用户标识，请重试');
  return uid;
}

/** 注册新账号（云开发版本没有这个入口） */
export async function register(username, password, nickName = '') {
  const data = await request('POST', '/auth/register', { username, password, nickName });
  setToken(data && data.token);
  const uid = await currentUid();
  if (!uid) throw new Error('注册成功但未取到用户标识，请重新登录');
  return uid;
}

export async function signOut() {
  setToken('');
}

/* ---------------- 图片：上传 + 地址解析 ---------------- */

const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const MAX_EDGE = 1280;

function randomName() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = Array.from(window.crypto.getRandomValues(new Uint8Array(16)));
  return bytes.map((v) => v.toString(16).padStart(2, '0')).join('');
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

// 手机直出照片常有几 MB，先缩放压缩再上传
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
  let quality = 0.85;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > UPLOAD_MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await toBlob(canvas, quality);
  }
  if (!blob) throw new Error('图片处理失败，请换一张图片重试');
  if (blob.size > UPLOAD_MAX_BYTES) throw new Error('图片压缩后仍超过 3MB，请换一张更小的图片');
  return new File([blob], `${randomName()}.jpg`, { type: 'image/jpeg' });
}

/**
 * 上传到后端静态目录，返回 /uploads/<folder>/<file> 形式的地址。
 * folder 只能是 avatar / forum / community，后端会校验目录白名单。
 */
export async function uploadImage(file, folder) {
  if (!file) throw new Error('请先选择图片');
  if (!String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  const prepared = await compress(file);

  const form = new FormData();
  // dir 必须先于 file 追加：后端 multer 在解析 file 时就要读 req.body.dir 决定落盘目录
  form.append('dir', folder);
  form.append('file', prepared, prepared.name);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}/upload`, { method: 'POST', headers, body: form });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    throw new Error('上传失败，请稍后重试');
  }
  if (!json || json.ok !== true) {
    if (response.status === 401) setToken('');
    throw new Error((json && json.message) || '图片上传失败，请重试');
  }
  return json.data.url;
}

/**
 * 后端现在直接返回可访问的 /uploads/ 地址，无需再换临时链接。
 * 历史数据里残留的 cloud:// 无法解析，返回空串（页面会走占位图）。
 */
export async function resolveImages(sources) {
  const output = {};
  (sources || []).forEach((src) => {
    if (typeof src !== 'string' || !src) return;
    output[src] = src.startsWith('cloud://') ? '' : src;
  });
  return output;
}

export async function resolveImage(src) {
  if (!src) return '';
  if (String(src).startsWith('cloud://')) return '';
  return src;
}
