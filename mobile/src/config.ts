/**
 * CloudBase 连接配置。
 *
 * Expo 会把 EXPO_PUBLIC_ 前缀的变量在构建期注入前端，读取 .env 后需要重启
 * `expo start` 才会生效（.env 变动不会热更新）。
 */
export type CloudBaseConfig = {
  env: string;
  region: string;
  accessKey: string;
};

function read(name: string, fallback = ''): string {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : fallback;
}

export const cloudbaseConfig: CloudBaseConfig = {
  env: read('EXPO_PUBLIC_CLOUDBASE_ENV'),
  region: read('EXPO_PUBLIC_CLOUDBASE_REGION', 'ap-shanghai'),
  // Publishable Key：可安全暴露在客户端，用于访问公开资源，无需额外登录步骤
  accessKey: read('EXPO_PUBLIC_CLOUDBASE_ACCESS_KEY'),
};

export const ENV_HINTS: Record<keyof CloudBaseConfig, string> = {
  env: 'EXPO_PUBLIC_CLOUDBASE_ENV（云开发环境 ID，如 cloud1-xxxx）',
  region: 'EXPO_PUBLIC_CLOUDBASE_REGION（默认 ap-shanghai）',
  accessKey: 'EXPO_PUBLIC_CLOUDBASE_ACCESS_KEY（Publishable Key，控制台 / API Key 生成）',
};

/** 返回缺失的配置项说明，全部齐全时为空数组 */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!cloudbaseConfig.env) missing.push(ENV_HINTS.env);
  if (!cloudbaseConfig.region) missing.push(ENV_HINTS.region);
  if (!cloudbaseConfig.accessKey) missing.push(ENV_HINTS.accessKey);
  return missing;
}

export function configErrorMessage(): string {
  return `缺少环境变量：${missingConfig().join('；')}。请复制 .env.example 为 .env 并填写后重启 Expo。`;
}
