/**
 * 后端连接配置。
 *
 * Expo 会把 EXPO_PUBLIC_ 前缀的变量在构建期注入前端，读取 .env 后需要重启
 * `expo start` 才会生效（.env 变动不会热更新）。
 *
 * ⚠️ RN 的 fetch 不支持相对路径，这里必须填完整地址，例如
 *    http://192.168.1.100:3000/api    （模拟器/真机同局域网调试）
 *    https://api.example.com/api      （线上）
 */
export type ApiConfig = {
  baseUrl: string;
};

function read(name: string, fallback = ''): string {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : fallback;
}

export const apiConfig: ApiConfig = {
  baseUrl: read('EXPO_PUBLIC_API_BASE').replace(/\/+$/, ''),
};

export const ENV_HINTS = {
  baseUrl: 'EXPO_PUBLIC_API_BASE（后端地址，如 http://192.168.1.100:3000/api）',
};

/** 返回缺失的配置项说明，全部齐全时为空数组 */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!apiConfig.baseUrl) missing.push(ENV_HINTS.baseUrl);
  return missing;
}

export function configErrorMessage(): string {
  return `缺少环境变量：${missingConfig().join('；')}。请复制 .env.example 为 .env 并填写后重启 Expo。`;
}
