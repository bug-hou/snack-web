import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { col } from '../db.js';
import { unauthorized, forbidden } from '../core/errors.js';
import { toObjectId } from '../core/ids.js';

/** 签发令牌：只放标识和角色，其余信息一律查库，避免令牌里的数据过期 */
export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role || 'user' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

async function loadUser(req) {
  const token = readToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
  if (!payload || !payload.sub) return null;
  const user = await col.users.findOne({ _id: toObjectId(payload.sub) });
  if (!user) return null;
  return user;
}

/** 必须登录：未登录直接 401 */
export async function requireAuth(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return next(unauthorized('请先登录'));
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * 可选登录：游客也能访问（只读接口用），登录了就带上身份。
 * 与云函数里的 GUEST_ACTIONS 设计一致，只是改由路由决定是否放行。
 */
export async function optionalAuth(req, res, next) {
  try {
    const user = await loadUser(req);
    if (user) req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** 必须站长：用于管理端全部接口 */
export async function requireAdmin(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return next(unauthorized('请先登录商家账号'));
    if (user.role !== 'admin') return next(forbidden('无权访问商家管理'));
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
