import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import COS from 'cos-nodejs-sdk-v5';
import { config } from '../config.js';
import { AppError } from '../core/errors.js';

/**
 * 图片存储：
 * - COS_ENABLED=true  → 腾讯云对象存储（生产用）
 * - 否则              → 本地 uploads/ 目录（本地开发用，无需密钥）
 * 两种模式对外的 URL 形态不同，IMAGE_PATTERN 会随之调整。
 */

// 目录白名单，与云开发存储保持一致
export const UPLOAD_DIRS = ['products', 'community', 'forum', 'avatar'];

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const HEX32 = '[a-f0-9]{32}';
const EXT = '(jpg|jpeg|png|webp)';

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** COS 模式下的公共访问前缀，例如 https://bucket.cos.ap-chengdu.myqcloud.com/ */
function cosBaseUrl() {
  const { bucket, region, prefix } = config.cos;
  return `https://${bucket}.cos.${region}.myqcloud.com/${prefix ? `${prefix}/` : ''}`;
}

export const IMAGE_PATTERN = new RegExp(
  `^${escapeRegExp(config.cos.enabled ? cosBaseUrl() : '/uploads/')}(${UPLOAD_DIRS.join('|')})/${HEX32}\\.${EXT}$`
);

let cosClient = null;
function getCos() {
  if (!cosClient) {
    cosClient = new COS({
      SecretId: config.cos.secretId,
      SecretKey: config.cos.secretKey
    });
  }
  return cosClient;
}

export function uploadRoot() {
  return path.isAbsolute(config.uploadDir) ? config.uploadDir : path.resolve(process.cwd(), config.uploadDir);
}

/* ---------------- multer ---------------- */

const localDiskStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = UPLOAD_DIRS.includes(req.body && req.body.dir) ? req.body.dir : 'community';
    const target = path.join(uploadRoot(), dir);
    try {
      fs.mkdirSync(target, { recursive: true });
      cb(null, target);
    } catch (error) {
      cb(error);
    }
  },
  filename(_req, file, cb) {
    cb(null, `${crypto.randomBytes(16).toString('hex')}.${MIME_EXT[file.mimetype] || ''}`);
  }
});

// COS 模式不需要落盘，直接拿内存里的 buffer 上传
const storage = config.cos.enabled ? multer.memoryStorage() : localDiskStorage;

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (!MIME_EXT[file.mimetype]) return cb(new AppError('仅支持 jpg、png、webp 图片'));
    return cb(null, true);
  }
}).single('file');

function receiveImage(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (error) => (error ? reject(error) : resolve()));
  });
}

/* ---------------- 落地 ---------------- */

function dirOf(req) {
  const dir = req.body && req.body.dir;
  return UPLOAD_DIRS.includes(dir) ? dir : 'community';
}

function keyOf(dir, ext) {
  const file = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  return config.cos.prefix ? `${config.cos.prefix}/${dir}/${file}` : `${dir}/${file}`;
}

async function putToCos(buffer, contentType, dir, ext) {
  const { bucket, region, private: isPrivate, signExpires } = config.cos;
  const Key = keyOf(dir, ext);
  await getCos().putObject({
    Bucket: bucket,
    Region: region,
    Key,
    Body: buffer,
    ContentType: contentType
  });
  // 私有桶返回带签名的临时链接（有时效）；公有读桶返回永久直链
  return getCos().getObjectUrl({
    Bucket: bucket,
    Region: region,
    Key,
    Sign: isPrivate,
    Expires: signExpires
  });
}

function localUrl(file) {
  const dir = path.basename(path.dirname(file.path));
  return `/uploads/${dir}/${file.filename}`;
}

/**
 * 接收一次上传并返回可访问的图片地址。
 * 表单里 dir 必须先于 file 追加，否则取不到目录。
 */
export async function handleUpload(req, res) {
  await receiveImage(req, res);
  if (!req.file) throw new AppError('请选择要上传的图片');

  const dir = dirOf(req);
  const ext = MIME_EXT[req.file.mimetype] || '';

  if (config.cos.enabled) {
    return putToCos(req.file.buffer, req.file.mimetype, dir, ext);
  }
  return localUrl(req.file);
}

/** 校验前端回传的图片地址，避免塞入任意外链 */
export function assertImageUrl(value, dirs = UPLOAD_DIRS, label = '图片') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (!IMAGE_PATTERN.test(text)) throw new AppError(`${label}不正确，请重新上传`);
  const matched = text.match(new RegExp(`/(${UPLOAD_DIRS.join('|')})/${HEX32}\\.${EXT}$`));
  if (!matched || !dirs.includes(matched[1])) throw new AppError(`${label}不正确，请重新上传`);
  return text;
}
