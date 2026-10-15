import cloudbase from '@cloudbase/js-sdk';

/**
 * 与小程序端 utils/snack-cloud.js 使用同一套协议：
 * 请求 { action, data } → 响应 { ok, message, data }
 */

const env = (import.meta.env.VITE_CLOUDBASE_ENV || '').trim();
export const CONFIG_ERROR = env
  ? ''
  : '缺少环境变量 VITE_CLOUDBASE_ENV，请在 .env 或部署平台的环境变量中配置云开发环境 ID';

const clientId = (import.meta.env.VITE_CLOUDBASE_CLIENT_ID || '').trim();

const initOptions = { env };
if (clientId) initOptions.clientId = clientId;

export const app = CONFIG_ERROR ? null : cloudbase.init(initOptions);
export const auth = app ? app.auth({ persistence: 'local' }) : null;

const AUTH_FAIL = /reading 'scope'|credentials not found|UNAUTHENTICATED|unauthenticated|401|请先登录/;
const DENIED = /PERMISSION_DENIED|Permission denied|OPERATION_FAIL/;

// SDK 有时把原始网关报文整段塞进 message，这里只留下能看懂的一句
function readable(raw) {
  if (!raw) return '';
  const text = String(raw).trim();
  if (!text.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(text);
    return String(parsed.message || parsed.msg || '').replace(/^\[|\]$/g, '').trim() || text;
  } catch (e) {
    return text;
  }
}

export function errorText(error) {
  const raw = (error && (error.message || error.errMsg || error.error_description)) || '';
  if (!raw) return '网络请求失败，请检查网络或安全域名配置';
  if (AUTH_FAIL.test(raw)) return '登录状态失效，请刷新页面后重试';
  const message = readable(raw);
  if (DENIED.test(message)) return '没有访问权限：请到云开发控制台把当前站点域名加入「WEB 安全域名」';
  return message || raw;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

export async function invoke(action, data = {}) {
  if (!app) throw new Error(CONFIG_ERROR);
  let response;
  try {
    response = await app.callFunction({ name: 'snackShop', data: { action, data }, parse: true });
  } catch (error) {
    throw new Error(errorText(error));
  }
  const result = typeof response.result === 'string' ? safeParse(response.result) : response.result;
  if (!result || result.ok !== true) {
    throw new Error((result && result.message) || '服务暂不可用，请稍后重试');
  }
  return result.data;
}

/* ---------------- 登录态 ---------------- */

export async function currentUid() {
  if (!auth) return '';
  try {
    const state = await auth.getLoginState();
    const user = state && (state.user || (state.data && state.data.user));
    if (user) return user.uid || (user.user_metadata && user.user_metadata.uid) || '';
  } catch (e) { /* 未登录时接口会抛错，按未登录处理 */ }
  try {
    return (auth.currentUser && auth.currentUser.uid) || '';
  } catch (e) { return ''; }
}

/**
 * 游客自动匿名登录：CloudBase 控制台需开启「匿名登录」。
 * 登录成功后云函数会以 rn_<uid> 作为用户标识，与微信 openid 互不影响。
 */
export async function ensureLogin() {
  if (await currentUid()) return true;
  if (!auth) return false;
  try {
    const response = await auth.signInAnonymously();
    if (response && response.error) return false;
    return !!(await currentUid());
  } catch (e) {
    return false;
  }
}

export async function signInWithPassword(username, password) {
  const response = await auth.signInWithPassword({ username, password });
  if (response && response.error) throw new Error(response.error.message || '登录失败，请检查账号与密码');
  const uid = await currentUid();
  if (!uid) throw new Error('已登录但未取到用户标识，请检查 CloudBase 登录配置');
  return uid;
}

export async function signOut() {
  if (!auth) return;
  try { await auth.signOut(); } catch (e) { /* 忽略，仍然清理本地状态 */ }
}

/* ---------------- 图片：上传 + 临时链接 ---------------- */

const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const MAX_EDGE = 1280;

function randomName() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = Array.from(window.crypto.getRandomValues(new Uint8Array(16)));
  return bytes.map(v => v.toString(16).padStart(2, '0')).join('');
}

function toBlob(canvas, quality) {
  return new Promise(resolve => {
    if (canvas.toBlob) canvas.toBlob(resolve, 'image/jpeg', quality);
    else resolve(null);
  });
}

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch (e) { /* 走 img 兜底 */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解析失败，请换一张 JPG / PNG / WebP 图片')); };
    img.src = url;
  });
}

// 手机直出照片常有几 MB，先缩放压缩再上传，避免超出云存储限制
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
 * 上传到云存储，返回 cloud:// 形式的 fileID。
 * folder 只能是 avatar / forum / community，云函数会校验路径。
 */
export async function uploadImage(file, folder) {
  if (!file) throw new Error('请先选择图片');
  if (!String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  const prepared = await compress(file);
  const cloudPath = `${folder}/${randomName()}.jpg`;
  const result = await app.uploadFile({ cloudPath, filePath: prepared });
  const fileID = result && result.fileID;
  if (!fileID) throw new Error('图片上传失败，未返回文件地址');
  return fileID;
}

const urlCache = new Map();

/** 批量把 cloud:// fileID 换成可访问的临时链接 */
export async function resolveImages(sources) {
  const list = [...new Set((sources || []).filter(src => typeof src === 'string' && src))];
  const output = {};
  const missing = [];
  list.forEach(src => {
    if (!src.startsWith('cloud://')) { output[src] = src; return; }
    if (urlCache.has(src)) { output[src] = urlCache.get(src); return; }
    missing.push(src);
  });
  if (!missing.length) return output;
  try {
    const result = await app.getTempFileURL({ fileList: missing });
    (result && result.fileList ? result.fileList : []).forEach(item => {
      if (item && item.fileID && item.tempFileURL) urlCache.set(item.fileID, item.tempFileURL);
    });
  } catch (error) {
    console.warn('resolveImages failed', error);
  }
  missing.forEach(src => { output[src] = urlCache.get(src) || ''; });
  return output;
}

export async function resolveImage(src) {
  if (!src) return '';
  if (!String(src).startsWith('cloud://')) return src;
  const map = await resolveImages([src]);
  return map[src] || '';
}
