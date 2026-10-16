import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { assertImageUrl } from '../services/upload.js';
import { assertClean } from '../services/security.js';

/** 个人资料：昵称与头像。头像只允许使用本站上传地址，避免前端塞入任意外链。 */
export async function getProfile(userId) {
  const doc = await col.profiles.findOne({ _id: userId });
  return {
    nickName: doc && typeof doc.nickName === 'string' ? doc.nickName : '',
    avatarUrl: doc && typeof doc.avatarUrl === 'string' ? doc.avatarUrl : ''
  };
}

export async function saveProfile(userId, input) {
  const nickName = typeof input.nickName === 'string' ? input.nickName.trim().slice(0, 24) : '';
  if (nickName && nickName.length < 2) throw new AppError('昵称至少 2 个字');
  if (nickName) await assertClean(`昵称 ${nickName}`);

  const avatarUrl = typeof input.avatarUrl === 'string' ? input.avatarUrl.trim() : '';
  if (avatarUrl) assertImageUrl(avatarUrl, ['avatar'], '头像');

  const data = { nickName, avatarUrl, updatedAt: Date.now() };
  const existing = await col.profiles.findOne({ _id: userId });
  if (existing) {
    await col.profiles.updateOne({ _id: userId }, { $set: data });
  } else {
    await col.profiles.insertOne({ _id: userId, ...data, createdAt: Date.now() });
  }
  return data;
}
