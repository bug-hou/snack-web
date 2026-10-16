import 'dotenv/config';

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGO_DB || 'aishangli',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  adminUsernames: csv(process.env.ADMIN_USERNAMES || 'admin'),
  cos: {
    enabled: process.env.COS_ENABLED === 'true',
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || '',
    // 桶内统一前缀，可留空；写 "community" 则所有文件落在 community/ 下
    prefix: (process.env.COS_PREFIX || '').replace(/^\/+|\/+$/g, ''),
    // 私有桶返回带签名的临时链接；公有读桶返回永久直链
    private: process.env.COS_PRIVATE === 'true',
    signExpires: Number(process.env.COS_SIGN_EXPIRES || 7200)
  },
  tms: {
    enabled: process.env.TMS_ENABLED === 'true',
    secretId: process.env.TMS_SECRET_ID || '',
    secretKey: process.env.TMS_SECRET_KEY || '',
    region: process.env.TMS_REGION || 'ap-guangzhou'
  }
};

export function assertConfig() {
  if (!config.jwtSecret || config.jwtSecret === 'please-change-this-to-a-random-string') {
    throw new Error('请先在 .env 中设置 JWT_SECRET（可用 `openssl rand -hex 48` 生成）');
  }
  if (config.cos.enabled) {
    const { secretId, secretKey, bucket, region } = config.cos;
    const missing = [
      ['COS_SECRET_ID', secretId],
      ['COS_SECRET_KEY', secretKey],
      ['COS_BUCKET', bucket],
      ['COS_REGION', region]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new Error(`COS_ENABLED=true 时必须在 .env 中配置：${missing.join('、')}`);
    }
  }
}
