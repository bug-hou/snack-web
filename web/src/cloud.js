import cloudbase from '@cloudbase/js-sdk';

const env = import.meta.env.VITE_CLOUDBASE_ENV;
if (!env) throw new Error('缺少环境变量 VITE_CLOUDBASE_ENV，请在 .env 或 Makers 环境变量中配置');

const initOptions = { env };
if (import.meta.env.VITE_CLOUDBASE_CLIENT_ID) initOptions.clientId = import.meta.env.VITE_CLOUDBASE_CLIENT_ID;
const app = cloudbase.init(initOptions);
export const auth = app.auth();

export async function invoke(action, data = {}) {
  const response = await app.callFunction({ name: 'snackAdmin', data: { action, data }, parse: true });
  const result = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
  if (!result || result.ok !== true) throw new Error((result && result.message) || '请求失败，请稍后重试');
  return result.data;
}

export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

// 上传商品图片到云存储，返回 cloud:// fileID（小程序可直接用于 <image src>）
export async function uploadProductImage(file) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error('仅支持 JPG、PNG、WebP 格式图片');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('图片不能超过 3MB');
  const name = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '');
  const result = await app.uploadFile({ cloudPath: `products/${name}.${ext}`, filePath: file });
  if (!result || !result.fileID) throw new Error('图片上传失败，请重试');
  return result.fileID;
}

const urlCache = new Map();
// 将 cloud:// fileID 转为临时可访问链接；其他路径原样返回
export async function resolveImage(src) {
  if (!src) return '';
  if (!src.startsWith('cloud://')) return src.replace('/images/products/', '/products/');
  if (urlCache.has(src)) return urlCache.get(src);
  const result = await app.getTempFileURL({ fileList: [src] });
  const item = result && result.fileList && result.fileList[0];
  const url = item && item.tempFileURL ? item.tempFileURL : '';
  if (url) urlCache.set(src, url);
  return url;
}
