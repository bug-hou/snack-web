import cloudbase from '@cloudbase/js-sdk';
import ASSET_MAP from './assets-map.json';

const env = import.meta.env.VITE_CLOUDBASE_ENV;
if (!env) throw new Error('缺少环境变量 VITE_CLOUDBASE_ENV，请在 .env 或 Makers 环境变量中配置');

const initOptions = { env };
if (import.meta.env.VITE_CLOUDBASE_CLIENT_ID) initOptions.clientId = import.meta.env.VITE_CLOUDBASE_CLIENT_ID;
const app = cloudbase.init(initOptions);
export const auth = app.auth();
// 仓库内的旧本地图片路径 → 云端 fileID，供商品编辑器的「预设图」使用
export const ASSETS = ASSET_MAP;

// SDK（@cloudbase/oauth）在本地凭证缺失/过期时会先读 credentials.scope 再判空，
// 直接抛 TypeError；这里统一翻译成可操作的登录提示
const AUTH_FAIL = /reading 'scope'|credentials not found|UNAUTHENTICATED|unauthenticated|401|请先登录/;

export function normalizeError(error) {
  const raw = (error && (error.message || error.errMsg || error.error_description)) || '';
  if (AUTH_FAIL.test(raw)) return new Error('请先登录商家账号');
  return new Error(raw || '网络请求失败，请检查网络或安全域名配置');
}

// 登录接口本身的报错要保留原始原因，只把 SDK 崩溃翻译成人话
export function authErrorMessage(error) {
  const raw = (error && (error.message || error.errMsg || error.error_description)) || '';
  if (AUTH_FAIL.test(raw)) return '登录状态异常，请重新输入账号密码';
  return raw || '登录失败，请检查账号与密码';
}

export async function invoke(action, data = {}) {
  let response;
  try {
    response = await app.callFunction({ name: 'snackAdmin', data: { action, data }, parse: true });
  } catch (error) {
    throw normalizeError(error);
  }
  const result = typeof response.result === 'string' ? safeParse(response.result) : response.result;
  if (!result || result.ok !== true) {
    throw new Error((result && result.message) || '请求失败，请稍后重试');
  }
  return result.data;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

/* ---------------- 图片：上传 + 解析 ---------------- */

export const IMAGE_MAX_BYTES = 12 * 1024 * 1024; // 原始图片上限，压缩后再上传
export const IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024; // 云存储落盘上限
const MAX_EDGE = 1600;

function randomName() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  const rand = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map(v => v.toString(16).padStart(2, '0')).join('');
  return rand;
}

function toBlob(canvas, quality) {
  return new Promise(resolve => {
    if (canvas.toBlob) canvas.toBlob(resolve, 'image/jpeg', quality);
    else resolve(null);
  });
}

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch (e) { /* 继续走 img 兜底 */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解析失败，请换一张 JPG / PNG / WebP 图片')); };
    img.src = url;
  });
}

// 手机直出照片普遍 4~10MB，先按长边缩放 + JPEG 压缩，避免超出云存储限制
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

export async function uploadProductImage(file, onProgress) {
  if (!file) throw new Error('请先选择图片');
  if (!String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  if (file.size > IMAGE_MAX_BYTES) throw new Error(`原始图片不能超过 ${IMAGE_MAX_BYTES / 1024 / 1024}MB`);
  if (typeof onProgress === 'function') onProgress(0.1);
  const prepared = await compress(file);
  if (typeof onProgress === 'function') onProgress(0.4);
  const cloudPath = `products/${randomName()}.jpg`;
  let result;
  try {
    result = await app.uploadFile({
      cloudPath,
      filePath: prepared,
      onUploadProgress: progress => {
        if (typeof onProgress !== 'function') return;
        // SDK 回调的是 0~1 的小数，这里映射到 40%~100%
        const ratio = typeof progress === 'number' ? progress : 0;
        onProgress(0.4 + Math.min(Math.max(ratio, 0), 1) * 0.6);
      }
    });
  } catch (error) {
    throw new Error(error && error.message ? error.message : '图片上传失败，请重试');
  }
  const fileID = result && result.fileID;
  if (!fileID) throw new Error('图片上传失败，未返回文件地址');
  if (typeof onProgress === 'function') onProgress(1);
  return fileID;
}

const urlCache = new Map();
const pending = new Map();

// 批量把 cloud:// fileID 换成临时访问链接；仓库内的旧本地路径先映射为云端 fileID
export async function resolveImages(sources) {
  const list = [...new Set((sources || []).filter(src => typeof src === 'string' && src))];
  const mapped = list.map(src => ASSET_MAP[src] || src);
  const output = {};
  const missing = [];
  mapped.forEach((src, i) => {
    const key = list[i];
    if (!src.startsWith('cloud://')) { output[key] = src; return; }
    if (urlCache.has(src)) { output[key] = urlCache.get(src); return; }
    missing.push(src);
  });
  if (!missing.length) return output;
  try {
    const result = await app.getTempFileURL({ fileList: missing });
    (result && result.fileList ? result.fileList : []).forEach(item => {
      if (item && item.fileID && item.tempFileURL) {
        urlCache.set(item.fileID, item.tempFileURL);
      }
    });
  } catch (error) {
    // 解析失败时保持为空，界面回退到文字占位
    console.warn('resolveImages failed', error);
  }
  mapped.forEach((src, i) => {
    const key = list[i];
    if (output[key] !== undefined) return;
    output[key] = urlCache.get(src) || '';
  });
  return output;
}

export async function resolveImage(src) {
  if (!src) return '';
  const mapped = ASSET_MAP[src] || src;
  if (!mapped.startsWith('cloud://')) return mapped;
  if (urlCache.has(mapped)) return urlCache.get(mapped);
  if (pending.has(mapped)) return pending.get(mapped);
  const task = resolveImages([src]).then(map => map[src] || '').finally(() => pending.delete(mapped));
  pending.set(mapped, task);
  return task;
}
