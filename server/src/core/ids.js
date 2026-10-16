import { ObjectId } from 'mongodb';

/** 字符串 ID → ObjectId；非法输入返回 null，交给调用方决定如何处理 */
export function toObjectId(value) {
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

/** 取请求里的当前用户 ID（用户集合用 ObjectId 作为主键） */
export function currentUserId(req) {
  return req.user ? String(req.user._id) : '';
}
