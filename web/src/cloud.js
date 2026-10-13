import cloudbase from '@cloudbase/js-sdk';

const env = import.meta.env.VITE_CLOUDBASE_ENV;
if (!env) throw new Error('缺少环境变量 VITE_CLOUDBASE_ENV，请在 .env 或 Makers 环境变量中配置');

const initOptions = { env };
if (import.meta.env.VITE_CLOUDBASE_CLIENT_ID) initOptions.clientId = import.meta.env.VITE_CLOUDBASE_CLIENT_ID;
const app = cloudbase.init(initOptions);
export const auth = app.auth();

export async function invoke(action, data = {}) {
  const response = await app.callFunction({ name: 'snackAdmin', data: { action, data }, parse: true });
  const result = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
  if (!result || result.ok !== true) throw new Error((result && result.message) || '请求失败，请稍后重试');
  return result.data;
}
