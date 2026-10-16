/**
 * 与 Web / App 端同一套协议：{ action, data } → { ok, message, data }
 *
 * 早期走微信云开发（wx.cloud.callFunction），现在改为请求自建后端
 * （部署在 Lighthouse 的 server/）。
 *
 * ⚠️ 上线前必须在小程序后台「开发管理 → 开发设置 → 服务器域名」里
 *    把 API_BASE 的域名加入 request 合法域名，且该域名必须已完成 ICP 备案。
 *    开发阶段可在开发者工具「详情 → 本地设置」勾选「不校验合法域名」调试。
 */

const API_BASE = 'https://api.convenience.top/api';

// action → REST 映射，与 h5/src/lib/cloud.js、mobile/src/client.ts 保持一致
const ROUTES = {
  getContext: () => ['GET', '/settings'],
  getCatalog: () => ['GET', '/products'],

  getProfile: () => ['GET', '/profile'],
  saveProfile: (d) => ['PUT', '/profile', d],

  listPosts: (d) => ['GET', `/forum/posts${qs({ board: d.board, page: d.page })}`],
  getPost: (d) => ['GET', `/forum/posts/${d.id}`],
  listComments: (d) => ['GET', `/forum/comments${qs({ postId: d.postId })}`],

  listShares: (d) => ['GET', `/shares${qs({ scope: d.scope })}`],
  getShare: (d) => ['GET', `/shares/${d.id}`]
};

function qs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data: method === 'GET' ? undefined : data,
      header: { 'content-type': 'application/json' },
      timeout: 15000,
      success(res) {
        const body = res.data;
        if (res.statusCode >= 500) {
          reject(new Error('服务暂不可用，请稍后重试'));
          return;
        }
        if (!body || body.ok !== true) {
          const message = (body && body.message) || '服务暂不可用';
          const error = new Error(message);
          error.code = (body && body.code) || '';
          reject(error);
          return;
        }
        resolve(body.data);
      },
      fail() {
        reject(new Error('网络连接失败，请检查网络后重试'));
      }
    });
  });
}

function callShop(action, data = {}) {
  const route = ROUTES[action];
  if (!route) return Promise.reject(new Error(`未知操作：${action}`));
  const [method, path] = route(data || {});
  return request(method, path, data);
}

module.exports = { callShop, API_BASE };
