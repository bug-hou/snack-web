const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const auth = cloudbase.init().auth();
const settingsCollection = db.collection('snack_shop_settings_v1');
const products = db.collection('snack_products_v1');
const orders = db.collection('snack_orders_v1');
const addresses = db.collection('snack_addresses_v1');
const shares = db.collection('snack_shares_v1');
const posts = db.collection('snack_posts_v1');
const comments = db.collection('snack_comments_v1');
const _ = db.command;
// 社区相关表（shares / posts / comments）可能是后加的，首次调用时按需补建
const COLLECTION_NAMES = ['snack_shop_settings_v1', 'snack_products_v1', 'snack_orders_v1',
  'snack_addresses_v1', 'snack_shares_v1', 'snack_posts_v1', 'snack_comments_v1'];
let collectionsReady = null;
function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(COLLECTION_NAMES.map(name =>
      db.createCollection(name).catch(error => {
        console.log('createCollection skipped', name, error && error.errCode);
      })
    )).catch(() => {});
  }
  return collectionsReady;
}
const $ = _.aggregate;
const USER_PAGE_SIZE = 20;
const USER_SCAN_LIMIT = 2000;
const OPENID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const SETTINGS_ID = 'main';
const STATUSES = { pending: '待处理', quoted: '待确认报价', processing: '订单处理中', packed: '配货完成', delivering: '配送中', completed: '配送完成', cancelled: '已取消', confirmed: '订单处理中' };
const NEXT = { pending: ['quoted', 'processing', 'cancelled'], quoted: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['delivering', 'cancelled'], delivering: ['completed'], confirmed: ['packed', 'cancelled'] };
const SHARE_STATUS = { pending: '待审核', approved: '已公开', rejected: '未通过', off: '已下架', taken: '已转出' };
const SHARE_MAX_STATIONS = 10;
const CATEGORIES = ['fresh', 'household', 'dairy'];
const PRODUCT_IMAGES = ['/images/products/eggs.jpg', '/images/products/tissue.jpg', '/images/products/milk.jpg'];
// 商品图统一存放在云开发存储（COS）的 products/ 目录，旧数据在库里仍是本地路径，保留白名单兼容。
// Web 端上传时会先压缩再写盘，文件名由前端生成，这里只约束「目录 + 扩展名」，不再限制长度与字符形态
const UPLOADED_IMAGE = /^cloud:\/\/[a-zA-Z0-9._-]+\/products\/[a-zA-Z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$/;
const TONES = ['peach', 'cocoa', 'butter', 'sage', 'rose', 'mango', 'lemon', 'oat'];
const FORUM_BOARDS = ['chat', 'help', 'lost', 'notice'];
const FORUM_BOARD_TEXT = { chat: '邻里闲聊', help: '互帮互助', lost: '失物招领', notice: '社区公告' };
const HEX32 = /^[a-f0-9]{32}$/;
const ID_SAFE = /^[a-zA-Z0-9_-]{1,40}$/;
const DEFAULTS = { ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00', deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0, ownerOpenid: '', ownerWechat: '',
  expressEnabled: false, expressFollowShop: false, expressBaseFeeCents: 300, expressExtraFeeCents: 100, expressLargeFeeCents: 100, expressStart: '09:00', expressEnd: '21:00', expressStations: [],
  purchaseEnabled: false, purchaseFeeCents: 500, purchaseStart: '09:00', purchaseEnd: '21:00', purchaseStore: '京东便利店',
  secondhandEnabled: false };

function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label}格式不正确`);
  return value.trim();
}
function cents(value, label, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label}金额不正确`);
  return value;
}
function clock(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label}时间不正确`);
  return value;
}
function stations(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,，]/);
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const name = String(item || '').trim();
    if (!name || seen.has(name)) continue;
    if (name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('快递站点名称过长或格式不正确');
    seen.add(name);
    list.push(name);
    if (list.length >= SHARE_MAX_STATIONS) break;
  }
  return list;
}
async function settings() {
  const { data } = await settingsCollection.doc(SETTINGS_ID).get().catch(() => ({ data: null }));
  return { ...DEFAULTS, ...(data || {}) };
}
function checkedSettings(input) {
  if (!input || typeof input !== 'object' || typeof input.ordersEnabled !== 'boolean') throw new Error('请确认营业状态');
  const businessStart = clock(input.businessStart, '营业开始');
  const businessEnd = clock(input.businessEnd, '营业结束');
  const deliveryStart = clock(input.deliveryStart, '配送开始');
  const deliveryEnd = clock(input.deliveryEnd, '配送结束');
  if (businessStart >= businessEnd || deliveryStart >= deliveryEnd) throw new Error('结束时间应晚于开始时间');
  const ownerOpenid = input.ownerOpenid === '' || input.ownerOpenid == null ? '' : text(input.ownerOpenid, 80, '店主微信身份');
  if (ownerOpenid && !/^[a-zA-Z0-9_-]{16,80}$/.test(ownerOpenid)) throw new Error('店主微信身份格式不正确');
  const ownerWechat = typeof input.ownerWechat === 'string' ? input.ownerWechat.trim() : '';
  if (ownerWechat && !/^[a-zA-Z0-9_-]{3,40}$/.test(ownerWechat)) throw new Error('店主微信号格式不正确（3-40位字母、数字、下划线或减号）');
  const expressStart = clock(input.expressStart, '代取开始');
  const expressEnd = clock(input.expressEnd, '代取结束');
  const purchaseStart = clock(input.purchaseStart, '代买开始');
  const purchaseEnd = clock(input.purchaseEnd, '代买结束');
  if (expressStart >= expressEnd || purchaseStart >= purchaseEnd) throw new Error('结束时间应晚于开始时间');
  const purchaseStore = typeof input.purchaseStore === 'string' && input.purchaseStore.trim() ? text(input.purchaseStore, 20, '代买门店') : '京东便利店';
  return { ordersEnabled: input.ordersEnabled, businessStart, businessEnd, deliveryStart, deliveryEnd,
    deliveryFeeCents: cents(input.deliveryFeeCents, '配送费', 10000),
    minOrderCents: cents(input.minOrderCents, '起送价', 1000000), ownerOpenid, ownerWechat,
    expressEnabled: input.expressEnabled === true,
    expressFollowShop: input.expressFollowShop === true,
    expressBaseFeeCents: cents(input.expressBaseFeeCents, '代取基础跑腿费', 10000),
    expressExtraFeeCents: cents(input.expressExtraFeeCents, '每多一件加价', 10000),
    expressLargeFeeCents: cents(input.expressLargeFeeCents, '大件加价', 10000),
    expressStart, expressEnd, expressStations: stations(input.expressStations),
    purchaseEnabled: input.purchaseEnabled === true,
    purchaseFeeCents: cents(input.purchaseFeeCents, '代买跑腿费', 10000),
    purchaseStart, purchaseEnd, purchaseStore,
    secondhandEnabled: input.secondhandEnabled === true };
}
function productInput(input) {
  const name = text(input.name, 40, '商品名称');
  const spec = text(input.spec, 60, '商品规格');
  const category = text(input.category, 20, '商品分类');
  if (!CATEGORIES.includes(category)) throw new Error('请选择商品分类');
  const priceCents = cents(input.priceCents, '商品价格', 1000000);
  if (priceCents === 0) throw new Error('商品价格须大于零');
  const label = input.label ? text(input.label, 12, '商品标签') : '';
  const tone = TONES.includes(input.tone) ? input.tone : 'peach';
  if (typeof input.is_available !== 'boolean' || typeof input.featured !== 'boolean') throw new Error('商品状态不正确');
  const image = input.image ? text(input.image, 300, '商品图片') : '';
  if (image && !PRODUCT_IMAGES.includes(image) && !UPLOADED_IMAGE.test(image)) throw new Error('商品图片不正确，请重新上传');
  return { name, spec, category, priceCents, label, tone, image, initials: name.slice(0, 2),
    is_available: input.is_available, featured: input.featured, archived: false, updatedAt: Date.now() };
}
// 删除商品只做归档：历史订单仍按 id 引用商品，物理删除会导致订单明细无法展示
async function deleteProduct(input) {
  const id = text(input.id, 40, '商品编号');
  if (!ID_SAFE.test(id)) throw new Error('商品编号格式不正确');
  const { data } = await products.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('商品不存在');
  await products.doc(id).update({ data: { archived: true, is_available: false, updatedAt: Date.now() } });
  return { id };
}
async function getOrders(input) {
  const page = Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100 ? input.page : 1;
  const status = input.status ? text(input.status, 20, '订单状态') : '';
  if (status && !STATUSES[status]) throw new Error('订单状态不正确');
  const type = ['goods', 'express', 'purchase'].includes(input.type) ? input.type : '';
  const where = {};
  if (status) where.status = status;
  // 现货订单早期没有 orderType 字段，用 nin 排除两种服务单即可
  if (type === 'express' || type === 'purchase') where.orderType = type;
  else if (type === 'goods') where.orderType = _.nin(['express', 'purchase']);
  const { data } = await orders.where(where).orderBy('createdAt', 'desc').skip((page - 1) * 20).limit(20).get();
  return { list: data.map(item => ({ ...item, statusText: STATUSES[item.status] || item.status })), page, hasMore: data.length === 20 };
}
// 用户来源于下过单或保存过地址的顾客；按最近活跃时间排序，支持按姓名/手机号/门牌搜索
async function getUsers(input) {
  const page = Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 200 ? input.page : 1;
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase().slice(0, 30) : '';
  const [orderGroups, addressGroups] = await Promise.all([
    orders.aggregate().sort({ createdAt: -1 }).group({
      _id: '$customerOpenid',
      orderCount: $.sum(1),
      spentCents: $.sum($.cond({ if: $.eq(['$status', 'cancelled']), then: 0, else: '$totalCents' })),
      lastOrderAt: $.max('$createdAt'),
      recipient: $.first('$recipient'), phone: $.first('$phone'),
      building: $.first('$building'), room: $.first('$room')
    }).limit(USER_SCAN_LIMIT).end(),
    addresses.aggregate().sort({ updatedAt: -1 }).group({
      _id: '$customerOpenid',
      addressCount: $.sum(1),
      lastAddressAt: $.max('$updatedAt'),
      recipient: $.first('$recipient'), phone: $.first('$phone'),
      building: $.first('$building'), room: $.first('$room')
    }).limit(USER_SCAN_LIMIT).end()
  ]);
  const users = new Map();
  for (const g of addressGroups.list) {
    if (!g._id) continue;
    users.set(g._id, { openid: g._id, orderCount: 0, spentCents: 0, lastOrderAt: 0,
      addressCount: g.addressCount || 0, lastAddressAt: g.lastAddressAt || 0,
      recipient: g.recipient || '', phone: g.phone || '', building: g.building || '', room: g.room || '' });
  }
  for (const g of orderGroups.list) {
    if (!g._id) continue;
    const existing = users.get(g._id) || { openid: g._id, addressCount: 0, lastAddressAt: 0 };
    users.set(g._id, { ...existing, orderCount: g.orderCount || 0, spentCents: g.spentCents || 0,
      lastOrderAt: g.lastOrderAt || 0,
      recipient: g.recipient || existing.recipient || '', phone: g.phone || existing.phone || '',
      building: g.building || existing.building || '', room: g.room || existing.room || '' });
  }
  let list = [...users.values()].map(u => ({ ...u, lastActiveAt: Math.max(u.lastOrderAt || 0, u.lastAddressAt || 0) }));
  if (keyword) {
    list = list.filter(u => [u.recipient, u.phone, `${u.building}栋${u.room}`, u.openid].some(v => String(v || '').toLowerCase().includes(keyword)));
  }
  list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const total = list.length;
  const start = (page - 1) * USER_PAGE_SIZE;
  return { list: list.slice(start, start + USER_PAGE_SIZE), page, total, hasMore: start + USER_PAGE_SIZE < total };
}
async function getUserDetail(input) {
  const openid = text(input.openid, 80, '用户标识');
  if (!OPENID_PATTERN.test(openid)) throw new Error('用户标识格式不正确');
  const [orderResult, addressResult] = await Promise.all([
    orders.where({ customerOpenid: openid }).orderBy('createdAt', 'desc').limit(50).get(),
    addresses.where({ customerOpenid: openid }).orderBy('updatedAt', 'desc').limit(10).get()
  ]);
  return {
    orders: orderResult.data.map(item => ({ ...item, statusText: STATUSES[item.status] || item.status })),
    addresses: addressResult.data.map(a => ({ id: a._id, label: a.label || '家', recipient: a.recipient, phone: a.phone,
      building: a.building, room: a.room, contactPreference: a.contactPreference,
      pickupPhoneLast4: typeof a.pickupPhoneLast4 === 'string' ? a.pickupPhoneLast4 : '', updatedAt: a.updatedAt }))
  };
}
async function listShares(input) {
  const page = Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100 ? input.page : 1;
  const status = input.status ? text(input.status, 20, '物品状态') : '';
  if (status && !SHARE_STATUS[status]) throw new Error('物品状态不正确');
  const { data } = await shares.where(status ? { status } : {}).orderBy('createdAt', 'desc').skip((page - 1) * 20).limit(20).get();
  return { list: data.map(item => ({ ...item, statusText: SHARE_STATUS[item.status] || item.status })), page, hasMore: data.length === 20 };
}
async function quoteOrder(input) {
  const id = text(input.id, 40, '订单编号');
  const quoteCents = input.quoteCents;
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('订单编号格式不正确');
  if (!Number.isSafeInteger(quoteCents) || quoteCents < 0 || quoteCents > 1000000) throw new Error('商品报价不正确');
  const quoteNote = typeof input.quoteNote === 'string' ? text(input.quoteNote, 100, '报价说明') : '';
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing) throw new Error('订单不存在');
  if (existing.orderType !== 'purchase') throw new Error('仅代买订单需要报价');
  if (!['pending', 'quoted'].includes(existing.status)) throw new Error('当前状态不可报价');
  const serviceFeeCents = Number.isSafeInteger(existing.serviceFeeCents) ? existing.serviceFeeCents : 0;
  const result = await orders.where({ _id: id, status: existing.status })
    .update({ data: { status: 'quoted', quoteCents, quoteNote, totalCents: quoteCents + serviceFeeCents, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新重试');
  return { id, status: 'quoted' };
}
// 闲置发布即公开，管理端只做下架/恢复（保留 rejected 兼容历史数据）
async function reviewShare(input) {
  const id = text(input.id, 40, '物品编号');
  const status = text(input.status, 20, '物品状态');
  if (!/^[a-f0-9]{32}$/.test(id) || !['approved', 'off', 'rejected'].includes(status)) throw new Error('操作参数不正确');
  const reason = status === 'rejected' ? text(input.reason, 60, '未通过原因')
    : (typeof input.reason === 'string' ? input.reason.trim().slice(0, 60) : '');
  const { data: existing } = await shares.doc(id).get().catch(() => ({ data: null }));
  if (!existing) throw new Error('物品不存在');
  if (!['pending', 'approved', 'rejected', 'off', 'taken'].includes(existing.status)) throw new Error('物品状态不正确');
  const result = await shares.where({ _id: id, status: existing.status })
    .update({ data: { status, rejectReason: reason, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('物品状态已变化，请刷新重试');
  return { id, status };
}
async function changeStatus(input) {
  const id = text(input.id, 40, '订单编号');
  const status = text(input.status, 20, '订单状态');
  if (!/^[a-f0-9]{32}$/.test(id) || !STATUSES[status]) throw new Error('订单参数不正确');
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing || !(NEXT[existing.status] || []).includes(status)) throw new Error('订单状态已变化，请刷新重试');
  const result = await orders.where({ _id: id, status: existing.status }).update({ data: { status, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新重试');
  return { id, status };
}
async function saveProduct(input) {
  const product = productInput(input);
  if (input.id) {
    const id = text(input.id, 40, '商品编号');
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error('商品编号格式不正确');
    const { data } = await products.doc(id).get().catch(() => ({ data: null }));
    if (!data) throw new Error('商品不存在');
    await products.doc(id).update({ data: product });
    return { id };
  }
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await products.add({ data: { _id: id, ...product, createdAt: Date.now() } });
  return { id };
}
// 闲置：除了上下架，也允许彻底删除（含图片引用一并丢弃）
async function deleteShare(input) {
  const id = text(input.id, 40, '物品编号');
  if (!HEX32.test(id)) throw new Error('物品编号格式不正确');
  const { data } = await shares.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('物品不存在');
  await shares.doc(id).remove();
  return { id };
}
async function listPosts(input) {
  const page = Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100 ? input.page : 1;
  const board = input.board ? text(input.board, 12, '板块') : '';
  if (board && !FORUM_BOARDS.includes(board)) throw new Error('板块不正确');
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase().slice(0, 40) : '';
  const where = board ? { board } : {};
  // 关键词只能内存匹配：先取一页，再在页内过滤，保证接口稳定且不会全表扫描
  const { data } = await posts.where(where).orderBy('createdAt', 'desc').skip((page - 1) * 20).limit(20).get();
  let list = data.map(item => ({ ...item, boardText: FORUM_BOARD_TEXT[item.board] || item.board }));
  if (keyword) {
    list = list.filter(item => [item.title, item.content, item.authorAlias].some(v => String(v || '').toLowerCase().includes(keyword)));
  }
  return { list, page, hasMore: data.length === 20 };
}
async function deletePost(input) {
  const id = text(input.id, 40, '帖子编号');
  if (!HEX32.test(id)) throw new Error('帖子编号格式不正确');
  const { data } = await posts.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('帖子不存在或已删除');
  await posts.doc(id).remove();
  await comments.where({ postId: id }).remove().catch(() => ({}));
  return { id };
}
async function listComments(input) {
  const postId = text(input.postId, 40, '帖子编号');
  if (!HEX32.test(postId)) throw new Error('帖子编号格式不正确');
  const { data } = await comments.where({ postId }).orderBy('createdAt', 'asc').limit(100).get();
  return data.map(item => ({ id: item._id, postId, content: item.content, author: item.authorAlias || '邻居', createdAt: item.createdAt }));
}
async function deleteComment(input) {
  const id = text(input.id, 40, '评论编号');
  if (!HEX32.test(id)) throw new Error('评论编号格式不正确');
  const { data } = await comments.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('评论不存在或已删除');
  await comments.doc(id).remove();
  await posts.doc(data.postId).update({ data: { commentCount: _.inc(-1) } }).catch(() => ({}));
  return { id };
}
// 北京时间当天 00:00 的时间戳，用于「今日订单」统计
function todayStartMs() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return start - 8 * 60 * 60 * 1000;
}
async function dashboardStats() {
  const since = todayStartMs();
  const [pending, today, productCount, shareCount, postCount, users] = await Promise.all([
    orders.where({ status: 'pending' }).count().catch(() => ({ total: 0 })),
    orders.where({ createdAt: _.gte(since) }).count().catch(() => ({ total: 0 })),
    products.where({ archived: _.neq(true) }).count().catch(() => ({ total: 0 })),
    shares.where({ status: 'approved' }).count().catch(() => ({ total: 0 })),
    posts.count().catch(() => ({ total: 0 })),
    getUsers({ page: 1 }).catch(() => ({ total: 0 }))
  ]);
  let todayRevenueCents = 0;
  try {
    const { data } = await orders.where({ createdAt: _.gte(since), status: _.neq('cancelled') }).limit(200).get();
    todayRevenueCents = data.reduce((sum, item) => sum + (Number.isSafeInteger(item.totalCents) ? item.totalCents : 0), 0);
  } catch (error) { /* 统计失败不影响主流程 */ }
  return { pendingCount: pending.total || 0, todayCount: today.total || 0, todayRevenueCents,
    productCount: productCount.total || 0, shareCount: shareCount.total || 0,
    postCount: postCount.total || 0, userCount: users.total || 0 };
}

exports.main = async (event, context) => {
  try {
    // 不同调用链路（Web SDK / 云调用）把登录身份放在不同位置，这里一并取，取到任意一个可信来源即可
    let trustedUid = '';
    try { trustedUid = (auth.getUserInfo && auth.getUserInfo())?.uid || ''; } catch (e) { /* 忽略，走 context 兜底 */ }
    if (!trustedUid && context) {
      const info = context.userInfo || {};
      trustedUid = info.uid || info.userId || (context.cloudbaseContext && context.cloudbaseContext.uid) || '';
    }
    if (!trustedUid) return { ok: false, message: '请先登录商家账号' };
    if (!process.env.SHOP_ADMIN_UID) return { ok: false, message: '云函数未配置 SHOP_ADMIN_UID，请联系开发者设置环境变量' };
    if (trustedUid !== process.env.SHOP_ADMIN_UID) {
      return { ok: false, message: `无权访问商家管理（当前账号 UID ${trustedUid}，与 SHOP_ADMIN_UID 不一致）` };
    }
    const input = event && event.data && typeof event.data === 'object' ? event.data : {};
    await ensureCollections();
    switch (event && event.action) {
      case 'getDashboard': {
        const current = await settings();
        return { ok: true, data: { settings: current, stats: await dashboardStats() } };
      }
      case 'getStats': return { ok: true, data: await dashboardStats() };
      case 'getOrders': return { ok: true, data: await getOrders(input) };
      case 'changeStatus': return { ok: true, data: await changeStatus(input) };
      case 'getUsers': return { ok: true, data: await getUsers(input) };
      case 'getUserDetail': return { ok: true, data: await getUserDetail(input) };
      case 'listShares': return { ok: true, data: await listShares(input) };
      case 'reviewShare': return { ok: true, data: await reviewShare(input) };
      case 'deleteShare': return { ok: true, data: await deleteShare(input) };
      case 'quoteOrder': return { ok: true, data: await quoteOrder(input) };
      case 'getProducts': {
        const { data } = await products.limit(100).get();
        return { ok: true, data: data.filter(item => item.archived !== true) };
      }
      case 'saveProduct': return { ok: true, data: await saveProduct(input) };
      case 'deleteProduct': return { ok: true, data: await deleteProduct(input) };
      case 'listPosts': return { ok: true, data: await listPosts(input) };
      case 'deletePost': return { ok: true, data: await deletePost(input) };
      case 'listComments': return { ok: true, data: await listComments(input) };
      case 'deleteComment': return { ok: true, data: await deleteComment(input) };
      case 'saveSettings': {
        const next = checkedSettings(input);
        const { data } = await settingsCollection.doc(SETTINGS_ID).get().catch(() => ({ data: null }));
        if (data) await settingsCollection.doc(SETTINGS_ID).update({ data: next });
        else await settingsCollection.add({ data: { _id: SETTINGS_ID, ...next } });
        return { ok: true, data: next };
      }
      default: return { ok: false, code: 'UNSUPPORTED_ACTION', message: `不支持的操作：${event && event.action}（请重新部署 snackAdmin 云函数）` };
    }
  } catch (error) {
    console.error('snackAdmin failed', event && event.action, error);
    return { ok: false, message: error.message || '服务暂不可用' };
  }
};
