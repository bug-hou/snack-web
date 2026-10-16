import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, assertConfig } from './config.js';
import { connectDb } from './db.js';
import { toErrorPayload, AppError } from './core/errors.js';
import { uploadRoot, UPLOAD_DIRS } from './services/upload.js';
import { buildRouter } from './routes.js';

assertConfig();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowAllOrigins = config.corsOrigin === '*';
const origins = allowAllOrigins
  ? '*'
  : config.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean);

// 通配符来源不能配 Allow-Credentials，否则浏览器会直接拒绝响应
app.use(cors({ origin: origins, credentials: !allowAllOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 安全响应头
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'TOO_MANY_REQUESTS', message: '尝试过于频繁，请稍后再试' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试' }
});

// 本地存储模式才需要静态托管；COS 模式下图片由对象存储直接提供
if (!config.cos.enabled) {
  const root = uploadRoot();
  app.use('/uploads', (req, res, next) => {
    const first = req.path.replace(/^\/+/, '').split('/')[0];
    if (!UPLOAD_DIRS.includes(first)) return res.status(403).end('forbidden');
    return next();
  });
  app.use('/uploads', express.static(root, { index: false, dotfiles: 'deny', maxAge: '7d' }));
}

app.use('/api', buildRouter({ authLimiter, apiLimiter }));

app.use((_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '接口不存在' }));

app.use((error, _req, res, _next) => {
  if (error instanceof AppError) {
    return res.status(error.status).json(toErrorPayload(error));
  }
  if (error && (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT')) {
    return res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: '图片过大或数量超限' });
  }
  console.error('unhandled error', error);
  return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: '服务暂不可用' });
});

const port = config.port;
connectDb()
  .then(() => {
    app.listen(port, () => console.log(`[server] listening on http://127.0.0.1:${port}`));
  })
  .catch((error) => {
    console.error('[server] failed to start', error);
    process.exit(1);
  });
