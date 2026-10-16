/**
 * 与 Web / App 端同一套协议：{ action, data } → { ok, message, data }
 *
 * 数据来自自建后端（部署在 Lighthouse 的 server/）。
 * 登录走微信小程序 wx.login：code → 后端换 openid → 签发 JWT，全程无感。
 *
 * ⚠️ 上线前必须在小程序后台「开发管理 → 开发设置 → 服务器域名」把
 *    https://api.convenience.top 加入 request 合法域名，且域名需完成 ICP 备案。
 *    开发阶段可在开发者工具「详情 → 本地设置」勾选「不校验合法域名」调试。
 */

const API_BASE = 'https://api.convenience.top/api';
const TOKEN_KEY = 'aishangli_token';

// 不需要登录即可访问的只读接口
const PUBLIC_ACTIONS = ['getContext', 'getCatalog', 'listPosts', 'getPost', 'listComments', 'listShares', 'getShare'];

// action → REST 映射，与 h5/src/lib/cloud.js、mobile/src/client.ts 保持一致
const ROUTES = {
  getContext: () => ['GET', '/settings'],
  getCatalog: () => ['GET', '/products'],

  getProfile: () => ['GET', '/profile'],
  saveProfile: () => ['PUT', '/profile'],

  listAddresses: () => ['GET', '/addresses'],
  saveAddress: () => ['POST', '/addresses'],
  deleteAddress: (d) => ['DELETE', `/addresses/${encodeURIComponent(d.id)}`],

  createOrder: () => ['POST', '/orders'],
  createServiceOrder: () => ['POST', '/orders'],
  listOrders: () => ['GET', '/orders'],
  deleteOrder: (d) => ['DELETE', `/orders/${encodeURIComponent(d.id)}`],
  changeStatus: (d) => ['PATCH', `/orders/${encodeURIComponent(d.id)}/status`],
  confirmQuote: (d) => ['POST', `/orders/${encodeURIComponent(d.id)}/confirm-quote`],

  listPosts: (d) => ['GET', `/forum/posts${qs({ board: d.board, page: d.page })}`],
  getPost: (d) => ['GET', `/forum/posts/${encodeURIComponent(d.id)}`],
  listComments: (d) => ['GET', `/forum/comments${qs({ postId: d.postId })}`],

  listShares: (d) => ['GET', `/shares${qs({ scope: d.scope })}`],
  getShare: (d) => ['GET', `/shares/${encodeURIComponent(d.id)}`]
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

/* ---------------- 令牌 ---------------- */

let token = '';
try { token = wx.getStorageSync(TOKEN_KEY) || ''; } catch (e) { token = ''; }

function setToken(next) {
  token = next || '';
  try {
    if (token) wx.setStorageSync(TOKEN_KEY, token);
    else wx.removeStorageSync(TOKEN_KEY);
  } catch (e) { /* 存储不可用时仅保留在内存 */ }
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) { res && res.code ? resolve(res.code) : reject(new Error('微信登录失败，请重试')); },
      fail() { reject(new Error('微信登录失败，请检查网络')); }
    });
  });
}

let loginTask = null;

/** 确保已登录；未登录时用 wx.login 换令牌 */
function ensureLogin() {
  if (token) return Promise.resolve(token);
  if (loginTask) return loginTask;
  loginTask = wxLogin()
    .then(code => request('POST', '/auth/wechat', { code }))
    .then((data) => { setToken(data && data.token); return token; })
    .finally(() => { loginTask = null; });
  return loginTask;
}

/* ---------------- 请求 ---------------- */

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const header = { 'content-type': 'application/json' };
    if (token) header.Authorization = `Bearer ${token}`;
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data: method === 'GET' ? undefined : (data || {}),
      header,
      timeout: 15000,
      success(res) {
        const body = res.data;
        if (res.statusCode >= 500) { reject(makeError('服务暂不可用，请稍后重试', res.statusCode)); return; }
        if (!body || body.ok !== true) {
          reject(makeError((body && body.message) || '服务暂不可用', res.statusCode, body && body.code));
          return;
        }
        resolve(body.data);
      },
      fail() { reject(makeError('网络连接失败，请检查网络后重试', 0)); }
    });
  });
}

function makeError(message, status, code) {
  const error = new Error(message);
  error.status = status || 0;
  error.code = code || '';
  return error;
}

async function callShop(action, data = {}) {
  const route = ROUTES[action];
  if (!route) return Promise.reject(new Error(`未知操作：${action}`));
  const [method, path] = route(data || {});

  if (PUBLIC_ACTIONS.indexOf(action) === -1) await ensureLogin();

  try {
    return await request(method, path, data);
  } catch (error) {
    // 令牌过期：清掉后重新登录再试一次
    if (error.status === 401 && PUBLIC_ACTIONS.indexOf(action) === -1) {
      setToken('');
      await ensureLogin();
      return request(method, path, data);
    }
    throw error;
  }
}

/**
 * 上传图片到后端，返回 /uploads/<dir>/<file> 地址。
 * dir 只能是 avatar / products / community / forum。
 */
async function uploadImage(filePath, dir) {
  await ensureLogin();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE}/upload`,
      filePath,
      name: 'file',
      formData: { dir: dir || 'avatar' },
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        let body = null;
        try { body = JSON.parse(res.data); } catch (e) { body = null; }
        if (!body || body.ok !== true) { reject(new Error((body && body.message) || '图片上传失败，请重试')); return; }
        resolve(body.data.url);
      },
      fail() { reject(new Error('图片上传失败，请检查网络')); }
    });
  });
}

module.exports = { callShop, uploadImage, ensureLogin, API_BASE };
