import crypto from 'node:crypto';

/**
 * 邻里广场不展示真实身份，用 userId 派生稳定的匿名昵称。
 * 算法与云函数版本一致，保证迁移后老用户的昵称不变。
 */
export function forumAlias(userId) {
  const digest = crypto.createHash('md5').update(`snack-forum:${userId}`).digest('hex');
  return `邻居${digest.slice(0, 4).toUpperCase()}`;
}
