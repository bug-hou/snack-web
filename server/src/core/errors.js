/** 业务错误：会原样把 message 返回给前端，status 决定 HTTP 状态码 */
export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new AppError(message, 400, 'BAD_REQUEST');
export const unauthorized = (message = '请先登录') => new AppError(message, 401, 'UNAUTHORIZED');
export const forbidden = (message = '无权访问') => new AppError(message, 403, 'FORBIDDEN');
export const notFound = (message = '内容不存在') => new AppError(message, 404, 'NOT_FOUND');
export const tooMany = (message) => new AppError(message, 429, 'TOO_MANY_REQUESTS');

/** 把任意异常收敛成统一结构，与云函数 { ok, message } 契约对齐 */
export function toErrorPayload(error) {
  if (error instanceof AppError) {
    return { ok: false, code: error.code, message: error.message };
  }
  console.error('unexpected error', error);
  return { ok: false, code: 'INTERNAL_ERROR', message: '服务暂不可用' };
}
