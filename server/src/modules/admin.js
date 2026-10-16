import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { requireText, requireHex32, requireCents, requireClock, pageOf } from '../core/validate.js';
import { money } from '../core/validate.js';
import { todayStartMs } from '../core/time.js';
import { STATUS, NEXT, ADMIN_PAGE_SIZE, USER_PAGE_SIZE, USER_SCAN_LIMIT, SHARE_MAX_STATIONS } from '../core/constants.js';
import { readSettings, writeSettings } from './settings.js';
import { viewOrder } from './orders.js';
import { toObjectId } from '../core/ids.js';

/* ---------- 仪表盘 ---------- */

export async function dashboardStats() {
  const since = todayStartMs();
  const [pending, today, productCount, shareCount, postCount, users] = await Promise.all([
    col.orders.countDocuments({ status: 'pending' }).catch(() => 0),
    col.orders.countDocuments({ createdAt: { $gte: since } }).catch(() => 0),
    col.products.countDocuments({ archived: { $ne: true } }).catch(() => 0),
    col.shares.countDocuments({ status: 'approved' }).catch(() => 0),
    col.posts.countDocuments({}).catch(() => 0),
    getUsers({ page: 1 }).catch(() => ({ total: 0 }))
  ]);

  let todayRevenueCents = 0;
  try {
    const list = await col.orders
      .find({ createdAt: { $gte: since }, status: { $ne: 'cancelled' } })
      .limit(200)
      .toArray();
    todayRevenueCents = list.reduce((sum, item) => sum + (Number.isSafeInteger(item.totalCents) ? item.totalCents : 0), 0);
  } catch {
    /* 统计失败不影响主流程 */
  }

  return {
    pendingCount: pending || 0,
    todayCount: today || 0,
    todayRevenueCents,
    productCount: productCount || 0,
    shareCount: shareCount || 0,
    postCount: postCount || 0,
    userCount: (users && users.total) || 0
  };
}

/* ---------- 订单 ---------- */

export async function adminListOrders(input = {}) {
  const page = pageOf(input.page, 100);
  const status = input.status ? requireText(input.status, 20, '订单状态') : '';
  if (status && !STATUS[status]) throw new AppError('订单状态不正确');

  const type = ['goods', 'express', 'purchase'].includes(input.type) ? input.type : '';
  const filter = {};
  if (status) filter.status = status;
  // 现货订单早期没有 orderType 字段，用 nin 排除两种服务单即可
  if (type === 'express' || type === 'purchase') filter.orderType = type;
  else if (type === 'goods') filter.orderType = { $nin: ['express', 'purchase'] };

  const list = await col.orders.find(filter).sort({ createdAt: -1 })
    .skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).toArray();
  return {
    list: list.map((item) => ({ ...viewOrder(item), statusText: STATUS[item.status] || item.status })),
    page,
    hasMore: list.length === ADMIN_PAGE_SIZE
  };
}

export async function adminChangeStatus(input) {
  const id = requireHex32(input.id, '订单编号');
  const status = requireText(input.status, 20, '订单状态');
  if (!STATUS[status]) throw new AppError('订单参数不正确');

  const existing = await col.orders.findOne({ _id: id });
  if (!existing || !(NEXT[existing.status] || []).includes(status)) {
    throw new AppError('订单状态已变化，请刷新重试');
  }
  const result = await col.orders.updateOne(
    { _id: id, status: existing.status },
    { $set: { status, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新重试');
  return { id, status };
}

export async function adminQuoteOrder(input) {
  const id = requireHex32(input.id, '订单编号');
  const quoteCents = input.quoteCents;
  if (!Number.isSafeInteger(quoteCents) || quoteCents < 0 || quoteCents > 1000000) {
    throw new AppError('商品报价不正确');
  }
  const quoteNote = typeof input.quoteNote === 'string' ? requireText(input.quoteNote, 100, '报价说明') : '';

  const existing = await col.orders.findOne({ _id: id });
  if (!existing) throw new AppError('订单不存在');
  if (existing.orderType !== 'purchase') throw new AppError('仅代买订单需要报价');
  if (!['pending', 'quoted'].includes(existing.status)) throw new AppError('当前状态不可报价');

  const serviceFeeCents = Number.isSafeInteger(existing.serviceFeeCents) ? existing.serviceFeeCents : 0;
  const result = await col.orders.updateOne(
    { _id: id, status: existing.status },
    { $set: { status: 'quoted', quoteCents, quoteNote, totalCents: quoteCents + serviceFeeCents, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新重试');
  return { id, status: 'quoted' };
}

/* ---------- 用户：来源于下过单或保存过地址的顾客 ---------- */

async function groupByCustomer(collection, sortField, extra = {}) {
  return collection.aggregate([
    { $sort: { [sortField]: -1 } },
    {
      $group: {
        _id: '$customerId',
        count: { $sum: 1 },
        lastAt: { $max: `$${sortField}` },
        recipient: { $first: '$recipient' },
        phone: { $first: '$phone' },
        building: { $first: '$building' },
        room: { $first: '$room' },
        ...extra
      }
    },
    { $limit: USER_SCAN_LIMIT }
  ], { allowDiskUse: true }).toArray();
}

export async function getUsers(input = {}) {
  const page = pageOf(input.page, 200);
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase().slice(0, 30) : '';

  const [orderGroups, addressGroups] = await Promise.all([
    groupByCustomer(col.orders, 'createdAt', {
      orderCount: { $sum: 1 },
      spentCents: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, '$totalCents'] } },
      lastOrderAt: { $max: '$createdAt' }
    }),
    groupByCustomer(col.addresses, 'updatedAt', {
      addressCount: { $sum: 1 },
      lastAddressAt: { $max: '$updatedAt' }
    })
  ]);

  const users = new Map();
  for (const g of addressGroups) {
    if (!g._id) continue;
    users.set(g._id, {
      userId: g._id,
      orderCount: 0,
      spentCents: 0,
      lastOrderAt: 0,
      addressCount: g.addressCount || 0,
      lastAddressAt: g.lastAddressAt || 0,
      recipient: g.recipient || '',
      phone: g.phone || '',
      building: g.building || '',
      room: g.room || ''
    });
  }
  for (const g of orderGroups) {
    if (!g._id) continue;
    const existing = users.get(g._id) || { addressCount: 0, lastAddressAt: 0 };
    users.set(g._id, {
      userId: g._id,
      orderCount: g.orderCount || 0,
      spentCents: g.spentCents || 0,
      lastOrderAt: g.lastOrderAt || 0,
      addressCount: existing.addressCount || 0,
      lastAddressAt: existing.lastAddressAt || 0,
      recipient: g.recipient || existing.recipient || '',
      phone: g.phone || existing.phone || '',
      building: g.building || existing.building || '',
      room: g.room || existing.room || ''
    });
  }

  let list = [...users.values()].map((u) => ({
    ...u,
    lastActiveAt: Math.max(u.lastOrderAt || 0, u.lastAddressAt || 0)
  }));
  if (keyword) {
    list = list.filter((u) => [u.recipient, u.phone, `${u.building}栋${u.room}`, u.userId]
      .some((v) => String(v || '').toLowerCase().includes(keyword)));
  }
  list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  const total = list.length;
  const start = (page - 1) * USER_PAGE_SIZE;
  return { list: list.slice(start, start + USER_PAGE_SIZE), page, total, hasMore: start + USER_PAGE_SIZE < total };
}

export async function getUserDetail(input) {
  const userId = requireText(input.userId, 40, '用户标识');
  if (!/^[a-f0-9]{24}$/.test(userId)) throw new AppError('用户标识格式不正确');
  const objectId = toObjectId(userId);
  if (!objectId) throw new AppError('用户标识格式不正确');

  const [orders, addresses, user] = await Promise.all([
    col.orders.find({ customerId: userId }).sort({ createdAt: -1 }).limit(50).toArray(),
    col.addresses.find({ customerId: userId }).sort({ updatedAt: -1 }).limit(10).toArray(),
    col.users.findOne({ _id: objectId })
  ]);

  return {
    user: user ? { id: userId, username: user.username, nickName: user.nickName || '' } : { id: userId, username: '', nickName: '' },
    orders: orders.map((item) => ({ ...viewOrder(item), statusText: STATUS[item.status] || item.status })),
    addresses: addresses.map((a) => ({
      id: a._id,
      label: a.label || '家',
      recipient: a.recipient,
      phone: a.phone,
      building: a.building,
      room: a.room,
      contactPreference: a.contactPreference,
      pickupPhoneLast4: typeof a.pickupPhoneLast4 === 'string' ? a.pickupPhoneLast4 : '',
      updatedAt: a.updatedAt
    }))
  };
}

/* ---------- 店铺设置 ---------- */

function stations(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,，]/);
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const name = String(item || '').trim();
    if (!name || seen.has(name)) continue;
    if (name.length > 20 || /[\x00-\x1F\x7F]/.test(name)) throw new AppError('快递站点名称过长或格式不正确');
    seen.add(name);
    list.push(name);
    if (list.length >= SHARE_MAX_STATIONS) break;
  }
  return list;
}

export function checkedSettings(input) {
  if (!input || typeof input !== 'object' || typeof input.ordersEnabled !== 'boolean') {
    throw new AppError('请确认营业状态');
  }
  const businessStart = requireClock(input.businessStart, '营业开始');
  const businessEnd = requireClock(input.businessEnd, '营业结束');
  const deliveryStart = requireClock(input.deliveryStart, '配送开始');
  const deliveryEnd = requireClock(input.deliveryEnd, '配送结束');
  if (businessStart >= businessEnd || deliveryStart >= deliveryEnd) throw new AppError('结束时间应晚于开始时间');

  const expressStart = requireClock(input.expressStart, '代取开始');
  const expressEnd = requireClock(input.expressEnd, '代取结束');
  const purchaseStart = requireClock(input.purchaseStart, '代买开始');
  const purchaseEnd = requireClock(input.purchaseEnd, '代买结束');
  if (expressStart >= expressEnd || purchaseStart >= purchaseEnd) throw new AppError('结束时间应晚于开始时间');

  const ownerWechat = typeof input.ownerWechat === 'string' ? input.ownerWechat.trim() : '';
  if (ownerWechat && !/^[a-zA-Z0-9_-]{3,40}$/.test(ownerWechat)) {
    throw new AppError('店主微信号格式不正确（3-40位字母、数字、下划线或减号）');
  }

  const purchaseStore = typeof input.purchaseStore === 'string' && input.purchaseStore.trim()
    ? requireText(input.purchaseStore, 20, '代买门店') : '京东便利店';

  return {
    ordersEnabled: input.ordersEnabled,
    businessStart,
    businessEnd,
    deliveryStart,
    deliveryEnd,
    deliveryFeeCents: requireCents(input.deliveryFeeCents, '配送费', 10000),
    minOrderCents: requireCents(input.minOrderCents, '起送价', 1000000),
    ownerWechat,
    expressEnabled: input.expressEnabled === true,
    expressFollowShop: input.expressFollowShop === true,
    expressBaseFeeCents: requireCents(input.expressBaseFeeCents, '代取基础跑腿费', 10000),
    expressExtraFeeCents: requireCents(input.expressExtraFeeCents, '每多一件加价', 10000),
    expressLargeFeeCents: requireCents(input.expressLargeFeeCents, '大件加价', 10000),
    expressStart,
    expressEnd,
    expressStations: stations(input.expressStations),
    purchaseEnabled: input.purchaseEnabled === true,
    purchaseFeeCents: requireCents(input.purchaseFeeCents, '代买跑腿费', 10000),
    purchaseStart,
    purchaseEnd,
    purchaseStore,
    secondhandEnabled: input.secondhandEnabled === true
  };
}

export async function saveSettings(input) {
  return writeSettings(checkedSettings(input));
}

export async function getDashboard() {
  return { settings: await readSettings(), stats: await dashboardStats() };
}

export { money };
