import { Router } from 'express';
import { config } from './config.js';
import { optionalAuth, requireAuth, requireAdmin } from './middleware/auth.js';
import { handleUpload } from './services/upload.js';
import { pingDb } from './db.js';
import { formatBeijing } from './core/time.js';
import { AppError } from './core/errors.js';
import { currentUserId } from './core/ids.js';
import * as auth from './modules/auth.js';
import * as settingsModule from './modules/settings.js';
import * as catalog from './modules/catalog.js';
import * as addresses from './modules/addresses.js';
import * as orders from './modules/orders.js';
import * as shares from './modules/shares.js';
import * as forum from './modules/forum.js';
import * as profile from './modules/profile.js';
import * as adminModule from './modules/admin.js';
import * as wechat from './modules/wechat.js';

const router = Router();

/** 统一包装：成功固定返回 { ok: true, data }，异常交给错误中间件 */
function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).then(
      (data) => res.json({ ok: true, data: data === undefined ? null : data }),
      next
    );
  };
}

const isAdmin = (req) => Boolean(req.user && req.user.role === 'admin');
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

/* ---------------- 健康检查 ---------------- */
router.get('/health', (_req, res) => res.json({ ok: true, data: { status: 'ok' } }));

/**
 * 冒烟测试：一次调用就能看出服务、数据库、存储配置是否正常。
 * 不返回任何密钥，可放心对外。
 */
router.get('/sayhi', wrap(async () => {
  const { date, clock } = formatBeijing(Date.now());
  return {
    message: 'pong',
    service: 'aishangli-server',
    version: '1.0.0',
    beijingTime: `${date} ${clock}`,
    uptimeSeconds: Math.round(process.uptime()),
    runtime: process.version,
    database: (await pingDb()) ? 'ok' : 'unavailable',
    databaseName: config.mongoDb,
    storage: config.cos.enabled
      ? `cos:${config.cos.bucket}@${config.cos.region}`
      : `local:${config.uploadDir}`,
    corsOrigin: config.corsOrigin
  };
}));

/* ---------------- 账号 ---------------- */
router.post('/auth/register', wrap((req) => auth.register(body(req))));
router.post('/auth/login', wrap((req) => auth.login(body(req))));
// 微信小程序登录：code 换 openid，首次自动建号
router.post('/auth/wechat', wrap((req) => wechat.loginWithCode((body(req) || {}).code)));
// 微信账号补设用户名密码，之后可在网站登录
router.post('/auth/bind-password', requireAuth, wrap((req) => wechat.bindPassword(req.user, body(req))));
router.get('/auth/me', requireAuth, wrap((req) => auth.me(req.user)));
router.post('/auth/password', requireAuth, wrap((req) => auth.changePassword(req.user, body(req))));
router.patch('/auth/nickname', requireAuth, wrap((req) => auth.updateNickName(req.user, body(req))));

/* ---------------- 公开/半公开内容（游客可读） ---------------- */
router.get('/settings', optionalAuth, wrap(async (req) => ({
  ...settingsModule.publicSettings(await settingsModule.readSettings()),
  signedIn: Boolean(req.user),
  me: req.user ? { id: String(req.user._id), role: req.user.role || 'user', alias: req.user.nickName || '' } : null
})));

router.get('/products', wrap(() => catalog.listProducts()));
router.get('/shares', optionalAuth, wrap((req) => shares.listShares(currentUserId(req), req.query)));
router.get('/shares/:id', optionalAuth, wrap((req) => shares.getShare(currentUserId(req), { id: req.params.id })));
router.get('/forum/posts', optionalAuth, wrap((req) => forum.listPosts(currentUserId(req), req.query)));
router.get('/forum/posts/:id', optionalAuth, wrap((req) => forum.getPost(currentUserId(req), { id: req.params.id })));
router.get('/forum/comments', optionalAuth, wrap((req) => forum.listComments(currentUserId(req), req.query)));

/* ---------------- 需登录：资料与地址 ---------------- */
router.get('/profile', requireAuth, wrap((req) => profile.getProfile(currentUserId(req))));
router.put('/profile', requireAuth, wrap((req) => profile.saveProfile(currentUserId(req), body(req))));

router.get('/addresses', requireAuth, wrap((req) => addresses.listAddresses(currentUserId(req))));
router.post('/addresses', requireAuth, wrap((req) => addresses.saveAddress(currentUserId(req), body(req))));
router.delete('/addresses/:id', requireAuth, wrap((req) => addresses.deleteAddress(currentUserId(req), { id: req.params.id })));

/* ---------------- 需登录：订单 ---------------- */
router.get('/orders', requireAuth, wrap((req) => orders.listOrders(currentUserId(req))));
router.post('/orders', requireAuth, wrap((req) => {
  const input = body(req);
  const type = String(input.type || '');
  if (type === 'express' || type === 'purchase') {
    return orders.createServiceOrder(currentUserId(req), input);
  }
  return orders.createOrder(currentUserId(req), input);
}));
router.delete('/orders/:id', requireAuth, wrap((req) => orders.deleteOrder(currentUserId(req), { id: req.params.id })));
router.patch('/orders/:id/status', requireAuth, wrap((req) =>
  orders.changeStatus(currentUserId(req), { id: req.params.id, ...body(req) }, isAdmin(req))));
router.post('/orders/:id/confirm-quote', requireAuth, wrap((req) =>
  orders.confirmQuote(currentUserId(req), { id: req.params.id })));
router.post('/orders/:id/quote', requireAuth, wrap((req) =>
  orders.quoteServiceOrder({ id: req.params.id, ...body(req) }, isAdmin(req))));

/* ---------------- 需登录：闲置与广场 ---------------- */
router.post('/shares', requireAuth, wrap((req) => shares.createShare(currentUserId(req), body(req))));
router.patch('/shares/:id', requireAuth, wrap((req) =>
  shares.updateShare(currentUserId(req), { id: req.params.id, ...body(req) })));

router.post('/forum/posts', requireAuth, wrap((req) => forum.createPost(currentUserId(req), body(req), isAdmin(req))));
router.delete('/forum/posts/:id', requireAuth, wrap((req) =>
  forum.deletePost(currentUserId(req), { id: req.params.id }, isAdmin(req))));
router.post('/forum/posts/:id/like', requireAuth, wrap((req) => forum.toggleLike(currentUserId(req), { id: req.params.id })));
router.post('/forum/comments', requireAuth, wrap((req) => forum.createComment(currentUserId(req), body(req))));
router.delete('/forum/comments/:id', requireAuth, wrap((req) =>
  forum.deleteComment(currentUserId(req), { id: req.params.id }, isAdmin(req))));

/* ---------------- 需登录：图片上传 ---------------- */
router.post('/upload', requireAuth, wrap(async (req, res) => {
  const url = await handleUpload(req, res);
  return { url };
}));

/* ---------------- 管理端 ---------------- */
const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', wrap(() => adminModule.getDashboard()));
adminRouter.get('/stats', wrap(() => adminModule.dashboardStats()));
adminRouter.get('/orders', wrap((req) => adminModule.adminListOrders(req.query)));
adminRouter.patch('/orders/:id/status', wrap((req) =>
  adminModule.adminChangeStatus({ id: req.params.id, ...body(req) })));
adminRouter.post('/orders/:id/quote', wrap((req) =>
  adminModule.adminQuoteOrder({ id: req.params.id, ...body(req) })));
adminRouter.get('/users', wrap((req) => adminModule.getUsers(req.query)));
adminRouter.get('/users/:userId', wrap((req) => adminModule.getUserDetail({ userId: req.params.userId })));
adminRouter.get('/settings', wrap(() => settingsModule.readSettings()));
adminRouter.put('/settings', wrap((req) => adminModule.saveSettings(body(req))));
adminRouter.get('/products', wrap(() => catalog.listAllProducts()));
adminRouter.post('/products', wrap((req) => catalog.saveProduct(body(req))));
adminRouter.delete('/products', wrap((req) => catalog.deleteProduct(body(req))));
adminRouter.get('/shares', wrap((req) => shares.adminListShares(req.query)));
adminRouter.patch('/shares/:id', wrap((req) => shares.reviewShare({ id: req.params.id, ...body(req) })));
adminRouter.delete('/shares/:id', wrap((req) => shares.deleteShare({ id: req.params.id })));
adminRouter.get('/posts', wrap((req) => forum.adminListPosts(req.query)));
adminRouter.delete('/posts/:id', wrap((req) => forum.adminDeletePost({ id: req.params.id })));
adminRouter.get('/comments', wrap((req) => forum.adminListComments(req.query)));
adminRouter.delete('/comments/:id', wrap((req) => forum.adminDeleteComment({ id: req.params.id })));

/* ---------------- 挂载 ---------------- */
export function buildRouter({ authLimiter, apiLimiter }) {
  const root = Router();
  root.get('/config', (_req, res) => res.json({ ok: true, data: { uploadMaxMb: Math.floor(config.maxUploadBytes / 1024 / 1024) } }));
  root.use('/auth/login', authLimiter);
  root.use('/auth/register', authLimiter);
  root.use(apiLimiter);
  root.use('/admin', adminRouter);
  root.use('/', router);
  return root;
}
