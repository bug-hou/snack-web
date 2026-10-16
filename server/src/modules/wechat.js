import { config } from '../config.js';
import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { signToken } from '../middleware/auth.js';

/**
 * 微信小程序登录。
 * 小程序端 wx.login() 拿到 code，后端用 code 换 openid，
 * 已存在则直接登录，不存在则自动建号。
 *
 * ⚠️ 与网站的用户名密码账号相互独立：自动打通需要 unionid，
 *    而 unionid 依赖微信开放平台账号（个人主体无法申请）。
 */

function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username || '',
    nickName: typeof user.nickName === 'string' ? user.nickName : '',
    role: user.role || 'user'
  };
}

/** code → openid（微信 jscode2session） */
export async function code2session(code) {
  const { appId, appSecret } = config.wechat;
  if (!appId || !appSecret) {
    throw new AppError('服务端未配置小程序 AppID / AppSecret', 500, 'NOT_CONFIGURED');
  }
  const text = String(code || '').trim();
  if (!text || text.length > 128) throw new AppError('登录凭证不正确');

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(text)}` +
    '&grant_type=authorization_code';

  let json = null;
  try {
    const response = await fetch(url, { timeout: 8000 });
    json = await response.json();
  } catch (error) {
    console.error('[wechat] jscode2session failed', error && error.message);
    throw new AppError('微信登录服务暂时不可用，请稍后重试');
  }

  if (!json || json.errcode || !json.openid) {
    // 不要把微信返回的原始报文直接抛给前端，避免泄露调试信息
    console.warn('[wechat] jscode2session error', json && json.errcode, json && json.errmsg);
    throw new AppError('微信登录失败，请重试');
  }
  return { openid: json.openid, unionid: json.unionid || '' };
}

/**
 * 用 code 登录。首次登录自动建号。
 * 微信用户不设置密码（passwordHash 为空），因此无法用密码登录，
 * 只能走微信链路，避免账号被冒用。
 */
export async function loginWithCode(code) {
  const { openid, unionid } = await code2session(code);

  let user = await col.users.findOne({ openid });
  if (!user) {
    const now = Date.now();
    // username 有唯一索引，用 openid 派生保证不冲突
    const username = `wx_${openid.slice(0, 16)}`;
    const role = config.adminUsernames.includes(username) ? 'admin' : 'user';
    const result = await col.users.insertOne({
      username,
      passwordHash: '',
      nickName: '',
      role,
      openid,
      unionid: unionid || '',
      createdAt: now,
      updatedAt: now
    });
    user = { _id: result.insertedId, username, role, nickName: '', openid };
  } else if (unionid && !user.unionid) {
    await col.users.updateOne({ _id: user._id }, { $set: { unionid, updatedAt: Date.now() } });
  }

  return { token: signToken(user), user: publicUser(user) };
}

/**
 * 给微信账号补设用户名密码，之后即可在网站登录（账号打通的手动方案）。
 */
export async function bindPassword(user, { username, password }) {
  const name = String(username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) throw new AppError('用户名需为3-20位字母、数字或下划线');

  const pwd = String(password || '');
  if (pwd.length < 8 || pwd.length > 64) throw new AppError('密码需为8-64位');

  if (await col.users.findOne({ username: name, _id: { $ne: user._id } })) {
    throw new AppError('用户名已被占用');
  }
  if (user.passwordHash) throw new AppError('该账号已设置过密码，请使用修改密码功能');

  const bcrypt = await import('bcryptjs');
  await col.users.updateOne(
    { _id: user._id },
    { $set: { username: name, passwordHash: bcrypt.hashSync(pwd, 10), updatedAt: Date.now() } }
  );
  return publicUser({ ...user, username: name });
}
