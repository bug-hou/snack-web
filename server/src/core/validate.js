import crypto from 'node:crypto';
import { AppError } from './errors.js';

// 控制字符（含 DEL）。用 \x 转义书写，避免源码里出现真实控制字符。
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

/** 必填文本：去掉首尾空格后非空、不超长、不含控制字符 */
export function requireText(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max || CONTROL_CHARS.test(text)) {
    throw new AppError(`${label}格式不正确`);
  }
  return text;
}

/** 选填文本：空值返回空串，否则按必填规则校验 */
export function optionalText(value, max, label) {
  if (value === undefined || value === null || value === '') return '';
  return requireText(value, max, label);
}

/** 金额（分）：必须是安全整数且在范围内 */
export function requireCents(value, label, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new AppError(`${label}金额不正确`);
  }
  return value;
}

/** 时间 HH:mm */
export function requireClock(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AppError(`${label}时间不正确`);
  }
  return value;
}

/** 32 位小写十六进制 ID */
export function requireHex32(value, label) {
  const text = requireText(value, 40, label);
  if (!/^[a-f0-9]{32}$/.test(text)) throw new AppError(`${label}格式不正确`);
  return text;
}

/** 数字页码 */
export function pageOf(value, max = 200, fallback = 1) {
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : fallback;
}

/** 新文档 ID：32 位小写十六进制，与云开发版本保持一致 */
export function newId() {
  return crypto.randomBytes(16).toString('hex');
}

/** 取件手机尾号：留空时回退为联系电话后四位 */
export function requirePhoneTail(value, fallbackPhone) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return String(fallbackPhone || '').slice(-4);
  if (!/^\d{4}$/.test(raw)) throw new AppError('取件手机尾号需为4位数字');
  return raw;
}

/** 分转元字符串 */
export function money(cents) {
  return ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
}

/** 布尔值：只接受 true/false，避免前端传字符串绕过校验 */
export function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new AppError(`${label}格式不正确`);
  return value;
}
