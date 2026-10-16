import bcrypt from 'bcryptjs';
import { col } from '../db.js';
import { config } from '../config.js';
import { AppError } from '../core/errors.js';
import { signToken } from '../middleware/auth.js';
import { assertClean } from '../services/security.js';
import { forumAlias } from '../core/alias.js';

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const BCRYPT_ROUNDS = 10;

function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    nickName: typeof user.nickName === 'string' ? user.nickName : '',
    role: user.role || 'user',
    alias: forumAlias(String(user._id))
  };
}

export async function register({ username, password, nickName }) {
  const name = String(username || '').trim();
  if (!USERNAME.test(name)) throw new AppError('用户名需为3-20位字母、数字或下划线');

  const pwd = String(password || '');
  if (pwd.length < 8 || pwd.length > 64) throw new AppError('密码需为8-64位');

  const nickname = typeof nickName === 'string' ? nickName.trim().slice(0, 24) : '';
  if (nickname && nickname.length < 2) throw new AppError('昵称至少 2 个字');
  if (nickname) await assertClean(`昵称 ${nickname}`);

  if (await col.users.findOne({ username: name })) throw new AppError('用户名已被注册');

  const now = Date.now();
  const role = config.adminUsernames.includes(name) ? 'admin' : 'user';
  const doc = {
    username: name,
    passwordHash: await bcrypt.hash(pwd, BCRYPT_ROUNDS),
    nickName: nickname,
    role,
    createdAt: now,
    updatedAt: now
  };
  const result = await col.users.insertOne(doc);
  const user = { ...doc, _id: result.insertedId };
  return { token: signToken(user), user: publicUser(user) };
}

export async function login({ username, password }) {
  const name = String(username || '').trim();
  const pwd = String(password || '');
  if (!name || !pwd) throw new AppError('请输入用户名和密码');

  const user = await col.users.findOne({ username: name });
  // 用户不存在时也走一次比对，避免通过响应时间枚举用户名
  const hash = user ? user.passwordHash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const matched = await bcrypt.compare(pwd, hash).catch(() => false);
  if (!user || !matched) throw new AppError('用户名或密码不正确');

  return { token: signToken(user), user: publicUser(user) };
}

export async function me(user) {
  return publicUser(user);
}

export async function changePassword(user, { oldPassword, newPassword }) {
  const matched = await bcrypt.compare(String(oldPassword || ''), user.passwordHash).catch(() => false);
  if (!matched) throw new AppError('原密码不正确');

  const pwd = String(newPassword || '');
  if (pwd.length < 8 || pwd.length > 64) throw new AppError('新密码需为8-64位');

  await col.users.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await bcrypt.hash(pwd, BCRYPT_ROUNDS), updatedAt: Date.now() } }
  );
  return { ok: true };
}

export async function updateNickName(user, { nickName }) {
  const nickname = typeof nickName === 'string' ? nickName.trim().slice(0, 24) : '';
  if (nickname && nickname.length < 2) throw new AppError('昵称至少 2 个字');
  if (nickname) await assertClean(`昵称 ${nickname}`);

  await col.users.updateOne({ _id: user._id }, { $set: { nickName: nickname, updatedAt: Date.now() } });
  return publicUser({ ...user, nickName: nickname });
}
