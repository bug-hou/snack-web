import { apiConfig, configErrorMessage } from './config';
import { SESSION_TOKEN_KEY, SESSION_UID_KEY, clearSessionStorage, storage } from './storage';

/**
 * 后端 HTTP 客户端。
 *
 * 早期走 CloudBase（@cloudbase/js-sdk + @cloudbase/adapter-rn）调用云函数，
 * 现在改为请求自建后端 server/（Node + MongoDB）。
 * 对外仍保持 `invoke(name, action, data)` 的调用方式，业务层无需改动。
 */

export type CloudFunctionName = 'snackShop' | 'snackAdmin';

type ApiResult<T> = { ok: true; data: T } | { ok: false; code?: string; message?: string };

/* ---------------- 令牌 ---------------- */

export function getToken(): string {
  return storage.getString(SESSION_TOKEN_KEY) ?? '';
}

export function currentUid(): string {
  return storage.getString(SESSION_UID_KEY) ?? '';
}

export function saveSession(token: string, uid: string): void {
  storage.set(SESSION_TOKEN_KEY, token);
  storage.set(SESSION_UID_KEY, uid);
}

/** 登录响应统一落库，返回用户标识 */
export function applyLogin(data: { token?: string; user?: { id?: string } }): string {
  const uid = data?.user?.id ?? '';
  if (!data?.token || !uid) throw new Error('登录响应缺少令牌或用户标识');
  saveSession(data.token, uid);
  return uid;
}

/* ---------------- 请求 ---------------- */

function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!apiConfig.baseUrl) throw new Error(configErrorMessage());

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${apiConfig.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('网络连接失败，请确认后端地址可达且手机与服务器在同一网络');
  }

  const json = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!json || json.ok !== true) {
    if (response.status === 401) {
      clearSessionStorage();
      throw new Error('登录状态已失效，请重新登录');
    }
    throw new Error((json && json.message) || '服务暂不可用，请稍后重试');
  }
  return json.data;
}

/* ---------------- action → REST 映射 ---------------- */

type Route = [string, string, unknown?];

const enc = (value: unknown) => encodeURIComponent(String(value));

const ROUTES: Record<string, (d: any) => Route> = {
  getContext: () => ['GET', '/settings'],
  getProfile: () => ['GET', '/profile'],
  saveProfile: (d) => ['PUT', '/profile', d],
  getCatalog: () => ['GET', '/products'],

  listAddresses: () => ['GET', '/addresses'],
  saveAddress: (d) => ['POST', '/addresses', d],
  deleteAddress: (d) => ['DELETE', `/addresses/${enc(d.id)}`],

  createOrder: (d) => ['POST', '/orders', d],
  createServiceOrder: (d) => ['POST', '/orders', d],
  listOrders: () => ['GET', '/orders'],
  deleteOrder: (d) => ['DELETE', `/orders/${enc(d.id)}`],
  changeStatus: (d) => ['PATCH', `/orders/${enc(d.id)}/status`, d],
  confirmQuote: (d) => ['POST', `/orders/${enc(d.id)}/confirm-quote`],
  quoteServiceOrder: (d) => ['POST', `/orders/${enc(d.id)}/quote`, d],

  listShares: (d) => ['GET', `/shares${queryString({ scope: d.scope })}`],
  getShare: (d) => ['GET', `/shares/${enc(d.id)}`],
  createShare: (d) => ['POST', '/shares', d],
  updateShare: (d) => ['PATCH', `/shares/${enc(d.id)}`, d],

  listPosts: (d) => ['GET', `/forum/posts${queryString({ board: d.board, page: d.page })}`],
  getPost: (d) => ['GET', `/forum/posts/${enc(d.id)}`],
  createPost: (d) => ['POST', '/forum/posts', d],
  deletePost: (d) => ['DELETE', `/forum/posts/${enc(d.id)}`],
  toggleLike: (d) => ['POST', `/forum/posts/${enc(d.id)}/like`],

  listComments: (d) => ['GET', `/forum/comments${queryString({ postId: d.postId })}`],
  createComment: (d) => ['POST', '/forum/comments', d],
  deleteComment: (d) => ['DELETE', `/forum/comments/${enc(d.id)}`],
};

/** 调用后端接口，协议与 Web 端保持一致：{ action, data } → { ok, message, data } */
export async function invoke<T>(
  _name: CloudFunctionName,
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const route = ROUTES[action];
  if (!route) throw new Error(`未知操作：${action}`);
  const [method, path, body] = route(data);
  const result = await request<T>(method, path, body);

  // getContext 在云函数版本里额外返回 isOwner / ownOpenid，这里补齐以兼容调用方
  if (action === 'getContext') {
    const { me, ...rest } = result as Record<string, any>;
    return { ...rest, isOwner: false, ownOpenid: me?.id ?? '' } as T;
  }
  return result;
}

/* ---------------- 账号 ---------------- */

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string; user: { id: string } }>('POST', '/auth/login', {
    username,
    password,
  });
  return applyLogin(data);
}

export async function register(
  username: string,
  password: string,
  nickName = '',
): Promise<string> {
  const data = await request<{ token: string; user: { id: string } }>('POST', '/auth/register', {
    username,
    password,
    nickName,
  });
  return applyLogin(data);
}

export function logout(): void {
  clearSessionStorage();
}

/** 统一翻译后端抛出的错误，便于在 UI 上直接展示 */
export function normalizeError(error: unknown): string {
  const raw =
    (error as { message?: string; errMsg?: string } | null)?.message ||
    (error as { errMsg?: string } | null)?.errMsg ||
    '';
  if (!raw) return '网络请求失败，请稍后重试';
  if (/collection.*not\s*exist|db not exist/i.test(raw)) return '数据集合还没初始化，请先部署后端服务';
  return raw;
}
