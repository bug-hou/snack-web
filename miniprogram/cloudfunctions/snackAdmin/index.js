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
const _ = db.command;
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
const UPLOADED_IMAGE = /^cloud:\/\/[a-zA-Z0-9._-]+\/products\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const TONES = ['peach', 'cocoa', 'butter', 'sage', 'rose', 'mango', 'lemon', 'oat'];
const DEFAULTS = { ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00', deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0, ownerOpenid: '', ownerWechat: '',
  expressEnabled: false, expressBaseFeeCents: 300, expressExtraFeeCents: 100, expressStart: '09:00', expressEnd: '21:00', expressStations: [],
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
  const list = raw.map(item => String(item || '').trim()).filter(Boolean).slice(0, SHARE_MAX_STATIONS);
  for (const item of list) {
    if (item.length > 20 || /[\u0000-\u001f\u007f]/.test(item)) throw new Error('快递站点名称过长或格式不正确');
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
    expressBaseFeeCents: cents(input.expressBaseFeeCents, '代取基础跑腿费', 10000),
    expressExtraFeeCents: cents(input.expressExtraFeeCents, '每多一件加价', 10000),
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
    is_available: input.is_available, featured: input.featured, updatedAt: Date.now() };
}
async function getOrders(input) {
  const page = Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100 ? input.page : 1;
  const status = input.status ? text(input.status, 20, '订单状态') : '';
  if (status && !STATUSES[status]) throw new Error('订单状态不正确');
  let query = orders.where(status ? { status } : {});
  const { data } = await query.orderBy('createdAt', 'desc').skip((page - 1) * 20).limit(20).get();
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
async function reviewShare(input) {
  const id = text(input.id, 40, '物品编号');
  const status = text(input.status, 20, '审核结果');
  if (!/^[a-f0-9]{32}$/.test(id) || !['approved', 'rejected'].includes(status)) throw new Error('审核参数不正确');
  const reason = status === 'rejected' ? text(input.reason, 60, '未通过原因') : '';
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

exports.main = async (event, context) => {
  try {
    const trustedUid = auth.getUserInfo()?.uid;
    const contextUid = context && context.userInfo && context.userInfo.uid;
    if (!trustedUid || (contextUid && trustedUid !== contextUid) ||
        !process.env.SHOP_ADMIN_UID || trustedUid !== process.env.SHOP_ADMIN_UID) {
      return { ok: false, message: '无权访问商家管理' };
    }
    const input = event && event.data && typeof event.data === 'object' ? event.data : {};
    switch (event && event.action) {
      case 'getDashboard': return { ok: true, data: { settings: await settings() } };
      case 'getOrders': return { ok: true, data: await getOrders(input) };
      case 'changeStatus': return { ok: true, data: await changeStatus(input) };
      case 'getUsers': return { ok: true, data: await getUsers(input) };
      case 'getUserDetail': return { ok: true, data: await getUserDetail(input) };
      case 'listShares': return { ok: true, data: await listShares(input) };
      case 'reviewShare': return { ok: true, data: await reviewShare(input) };
      case 'quoteOrder': return { ok: true, data: await quoteOrder(input) };
      case 'getProducts': {
        const { data } = await products.limit(100).get();
        return { ok: true, data: data.filter(item => item.archived !== true) };
      }
      case 'saveProduct': return { ok: true, data: await saveProduct(input) };
      case 'saveSettings': {
        const next = checkedSettings(input);
        const { data } = await settingsCollection.doc(SETTINGS_ID).get().catch(() => ({ data: null }));
        if (data) await settingsCollection.doc(SETTINGS_ID).update({ data: next });
        else await settingsCollection.add({ data: { _id: SETTINGS_ID, ...next } });
        return { ok: true, data: next };
      }
      default: return { ok: false, message: '不支持的操作' };
    }
  } catch (error) {
    console.error('snackAdmin failed', event && event.action, error);
    return { ok: false, message: error.message || '服务暂不可用' };
  }
};
