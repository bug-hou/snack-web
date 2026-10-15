const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
// 移动端（RN / Web）没有微信上下文，登录身份从 CloudBase 认证里取，与 snackAdmin 一致
const cloudbaseAuth = cloudbase.init().auth();
const products = db.collection('snack_products_v1');
const orders = db.collection('snack_orders_v1');
const shopSettings = db.collection('snack_shop_settings_v1');
const addresses = db.collection('snack_addresses_v1');
const shares = db.collection('snack_shares_v1');
const posts = db.collection('snack_posts_v1');
const comments = db.collection('snack_comments_v1');
const profiles = db.collection('snack_profiles_v1');
const dbCommand = db.command;
// 社区功能是后加的，shares / posts / comments 三张表可能还没在控制台建过；
// 云函数持有管理端权限，这里在首次调用时按需补建，省去手动建表的步骤
const COLLECTION_NAMES = ['snack_products_v1', 'snack_orders_v1', 'snack_shop_settings_v1',
  'snack_addresses_v1', 'snack_shares_v1', 'snack_posts_v1', 'snack_comments_v1', 'snack_profiles_v1'];
let collectionsReady = null;
function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(COLLECTION_NAMES.map(name =>
      db.createCollection(name).catch(error => {
        // 集合已存在（或当前环境不允许自动建表）时忽略，由后续查询自行报错
        console.log('createCollection skipped', name, error && error.errCode);
      })
    )).catch(() => {});
  }
  return collectionsReady;
}
const DEFAULT_SETTINGS = { ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00', deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0, ownerOpenid: '', ownerWechat: '',
  expressEnabled: false, expressFollowShop: false, expressBaseFeeCents: 300, expressExtraFeeCents: 100, expressLargeFeeCents: 100, expressStart: '09:00', expressEnd: '21:00', expressStations: [],
  purchaseEnabled: false, purchaseFeeCents: 500, purchaseStart: '09:00', purchaseEnd: '21:00', purchaseStore: '京东便利店',
  secondhandEnabled: false };
const STATUS = { pending: '待处理', quoted: '待确认报价', processing: '订单处理中', packed: '配货完成', delivering: '配送中', completed: '配送完成', cancelled: '已取消', confirmed: '订单处理中' };
const NEXT = { pending: ['quoted', 'processing', 'cancelled'], quoted: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['delivering', 'cancelled'], delivering: ['completed'], confirmed: ['packed', 'cancelled'] };
const BUILDINGS = ['16', '17', '18'];
const CONTACT_PREFERENCES = ['knock', 'call', 'no_knock'];
const ADDRESS_LIMIT = 10;
const EXPRESS_MAX_PACKAGES = 20;
const PURCHASE_MAX_ITEMS = 10;
const PACKAGE_SIZES = ['small', 'large'];
const SHARE_CONDITIONS = { new: '几乎全新', like: '九成新', used: '七成新', worn: '有使用痕迹' };
const SHARE_MODES = { sale: '二手转让', giveaway: '免费分享' };
const SHARE_STATUS = { pending: '待审核', approved: '已公开', rejected: '未通过', off: '已下架', taken: '已转出' };
const SHARE_LIMIT = 30;
const SHARE_IMAGE = /^cloud:\/\/[a-zA-Z0-9._-]+\/community\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const ORDER_KINDS = ['express', 'purchase'];
// 邻里广场：仅做社区信息交流，不接受交易、广告与联系方式
const FORUM_BOARDS = ['chat', 'help', 'lost', 'notice'];
const FORUM_OWNER_BOARDS = ['notice'];
const FORUM_TITLE_MAX = 40;
const FORUM_CONTENT_MAX = 1000;
const FORUM_COMMENT_MAX = 200;
const FORUM_IMAGE = /^cloud:\/\/[a-zA-Z0-9._-]+\/forum\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const FORUM_IMAGE_MAX = 3;
const FORUM_PAGE_SIZE = 15;
const FORUM_DAILY_POSTS = 10;
const FORUM_WINDOW_COMMENTS = 10;
const FORUM_WINDOW_MS = 10 * 60 * 1000;
const FORUM_LIKE_CAP = 500;
function addressView(a) {
  return { id: a._id, recipient: a.recipient, phone: a.phone, building: a.building,
    room: a.room, contactPreference: a.contactPreference, label: a.label || '家',
    pickupPhoneLast4: typeof a.pickupPhoneLast4 === 'string' ? a.pickupPhoneLast4 : '',
    updatedAt: a.updatedAt };
}
async function listAddresses(openid) {
  const result = await addresses.where({ customerOpenid: openid }).orderBy('updatedAt', 'desc').limit(ADDRESS_LIMIT).get();
  return result.data.map(addressView);
}
async function getOwnAddress(openid, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('请选择收货地址');
  const { data } = await addresses.doc(id).get().catch(() => ({ data: null }));
  if (!data || data.customerOpenid !== openid) throw new Error('地址不存在，请重新选择');
  return data;
}
async function saveAddress(openid, input) {
  const recipient = requireText(input.recipient, 30, '收货人');
  const phone = requireText(input.phone, 11, '联系电话');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入有效的手机号码');
  const building = requireText(input.building, 2, '楼栋');
  if (!BUILDINGS.includes(building)) throw new Error('当前仅配送16、17、18栋');
  const room = requireText(input.room, 20, '门牌号');
  if (!/^[0-9A-Za-z\u4e00-\u9fa5-]{1,20}$/.test(room)) throw new Error('请填写有效门牌号');
  const contactPreference = requireText(input.contactPreference, 16, '送达方式');
  if (!CONTACT_PREFERENCES.includes(contactPreference)) throw new Error('请选择送达联系偏好');
  const label = input.label ? requireText(input.label, 12, '地址标签') : '家';
  const pickupPhoneLast4 = requirePhoneTail(input.pickupPhoneLast4, phone);
  const data = { recipient, phone, building, room, contactPreference, label, pickupPhoneLast4, updatedAt: Date.now() };
  if (input.id) {
    const existing = await getOwnAddress(openid, input.id);
    const result = await addresses.where({ _id: existing._id, customerOpenid: openid }).update({ data });
    if (!result.stats || result.stats.updated !== 1) throw new Error('地址更新失败，请重试');
    return addressView({ _id: existing._id, ...data });
  }
  const { total } = await addresses.where({ customerOpenid: openid }).count();
  if (total >= ADDRESS_LIMIT) throw new Error('最多保存10个地址，请先删除不再使用的地址');
  const id = crypto.randomBytes(16).toString('hex');
  await addresses.add({ data: { _id: id, customerOpenid: openid, ...data, createdAt: Date.now() } });
  return addressView({ _id: id, ...data });
}
// 取件手机尾号可独立配置：留空时默认使用联系电话后四位
function requirePhoneTail(value, fallbackPhone) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallbackPhone.slice(-4);
  if (!/^\d{4}$/.test(raw)) throw new Error('取件手机尾号需为4位数字');
  return raw;
}
async function deleteAddress(openid, input) {
  const existing = await getOwnAddress(openid, input.id);
  const result = await addresses.where({ _id: existing._id, customerOpenid: openid }).remove();
  if (!result.stats || result.stats.removed !== 1) throw new Error('地址删除失败，请重试');
  return { id: existing._id };
}

async function readSettings() {
  const { data } = await shopSettings.doc('main').get().catch(() => ({ data: null }));
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}
function owner(openid, settings) {
  return !!(openid && (openid === process.env.SHOP_OWNER_OPENID || openid === settings.ownerOpenid));
}
function clockNow() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
function enabled(settings) {
  const current = clockNow();
  return settings.ordersEnabled === true && current >= settings.businessStart && current < settings.businessEnd &&
    current >= settings.deliveryStart && current < settings.deliveryEnd;
}
function stationList(settings) {
  return Array.isArray(settings.expressStations) ? settings.expressStations.filter(s => typeof s === 'string' && s.trim()).slice(0, 10) : [];
}
// 代取费用 = 基础跑腿费（含首件）+ 每多一件加价 + 每个大件加价
function expressFeeCents(settings, packages) {
  const largeCount = packages.filter(pkg => pkg.size === 'large').length;
  return settings.expressBaseFeeCents
    + settings.expressExtraFeeCents * Math.max(packages.length - 1, 0)
    + settings.expressLargeFeeCents * largeCount;
}
// 代取可以跟随店铺营业时间，避免和店铺营业状态不一致
function serviceWindow(settings, kind) {
  if (kind === 'express' && settings.expressFollowShop === true) {
    return { start: settings.businessStart, end: settings.businessEnd };
  }
  return { start: settings[`${kind}Start`], end: settings[`${kind}End`] };
}
function serviceOpen(settings, kind) {
  const { start, end } = serviceWindow(settings, kind);
  const current = clockNow();
  return settings[`${kind}Enabled`] === true && current >= start && current < end;
}
function publicSettings(settings) {
  return { isOpen: enabled(settings), ordersEnabled: settings.ordersEnabled === true,
    businessStart: settings.businessStart, businessEnd: settings.businessEnd,
    deliveryStart: settings.deliveryStart, deliveryEnd: settings.deliveryEnd,
    deliveryFeeCents: settings.deliveryFeeCents, minOrderCents: settings.minOrderCents,
    ownerWechat: typeof settings.ownerWechat === 'string' ? settings.ownerWechat : '',
    express: { enabled: serviceOpen(settings, 'express'), configured: settings.expressEnabled === true,
      baseFeeCents: settings.expressBaseFeeCents, extraFeeCents: settings.expressExtraFeeCents,
      largeFeeCents: settings.expressLargeFeeCents, followShop: settings.expressFollowShop === true,
      start: serviceWindow(settings, 'express').start, end: serviceWindow(settings, 'express').end,
      stations: stationList(settings) },
    purchase: { enabled: serviceOpen(settings, 'purchase'), configured: settings.purchaseEnabled === true,
      feeCents: settings.purchaseFeeCents, start: settings.purchaseStart, end: settings.purchaseEnd,
      store: typeof settings.purchaseStore === 'string' && settings.purchaseStore ? settings.purchaseStore : '京东便利店' },
    secondhand: { enabled: settings.secondhandEnabled === true } };
}
const DELIVERY_STEP_MS = 5 * 60 * 1000;
const DELIVERY_MAX_MS = 7 * 24 * 60 * 60 * 1000;
function formatBeijing(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = type => parts.find(p => p.type === type).value;
  return { date: `${get('month')}-${get('day')}`, clock: `${get('hour')}:${get('minute')}` };
}
function deliveryLabel(deliveryAt, settings) {
  if (deliveryAt === 0 || deliveryAt === undefined || deliveryAt === null) return '尽快送达';
  if (!Number.isSafeInteger(deliveryAt) || deliveryAt % DELIVERY_STEP_MS !== 0) throw new Error('期望送达时间不正确');
  const now = Date.now();
  if (deliveryAt < now) throw new Error('期望送达时间已过，请重新选择');
  if (deliveryAt > now + DELIVERY_MAX_MS) throw new Error('期望送达时间最多可选未来7天');
  const { date, clock } = formatBeijing(deliveryAt);
  if (clock < settings.deliveryStart || clock > settings.deliveryEnd) {
    throw new Error(`期望送达时间需在配送时段 ${settings.deliveryStart}—${settings.deliveryEnd} 内`);
  }
  return `期望 ${date} ${clock} 送达`;
}
function requireText(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label}格式不正确`);
  return text;
}
function optionalText(value, max, label) {
  if (value === undefined || value === null || value === '') return '';
  return requireText(value, max, label);
}
function viewProduct(p) {
  return { id: p._id, name: p.name, spec: p.spec, category: p.category, priceCents: p.priceCents,
    price: (p.priceCents / 100).toFixed(2), label: p.label || '', initials: p.initials || '',
    tone: p.tone || 'peach', image: p.image || '', featured: !!p.featured };
}
function money(cents) {
  return ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
}
function viewOrder(o) {
  const orderType = o.orderType === 'express' || o.orderType === 'purchase' ? o.orderType : 'goods';
  const deliveryFeeCents = Number.isSafeInteger(o.deliveryFeeCents) ? o.deliveryFeeCents : 0;
  const subtotalCents = Number.isSafeInteger(o.subtotalCents) ? o.subtotalCents : o.totalCents;
  const serviceFeeCents = Number.isSafeInteger(o.serviceFeeCents) ? o.serviceFeeCents : 0;
  const quoteCents = Number.isSafeInteger(o.quoteCents) ? o.quoteCents : 0;
  const packages = Array.isArray(o.packages) ? o.packages.map(p => ({ code: p.code, phoneLast4: p.phoneLast4, size: p.size })) : [];
  const purchaseItems = Array.isArray(o.purchaseItems) ? o.purchaseItems.map(item => ({ ...item })) : [];
  return { id: o._id, orderType, orderTypeText: orderType === 'express' ? '快递代取' : orderType === 'purchase' ? '便利店代买' : '便利铺现货',
    items: o.items || [], purchaseItems, packages, station: o.station || '', store: o.store || '',
    allowSubstitute: !!o.allowSubstitute, budgetCents: Number.isSafeInteger(o.budgetCents) ? o.budgetCents : 0,
    quoteCents, quote: money(quoteCents), quoteNote: o.quoteNote || '',
    subtotalCents, deliveryFeeCents, serviceFeeCents,
    subtotal: money(subtotalCents), deliveryFee: money(deliveryFeeCents), serviceFee: money(serviceFeeCents),
    totalCents: o.totalCents, total: money(o.totalCents),
    status: o.status, statusText: STATUS[o.status], recipient: o.recipient, phone: o.phone,
    address: o.address, building: o.building || '', room: o.room || '',
    contactPreference: o.contactPreference || 'knock', delivery: o.delivery, note: o.note,
    createdAt: o.createdAt, updatedAt: o.updatedAt, paymentMethod: '线下结算' };
}
async function getCatalog() {
  const res = await products.where({ is_available: true }).limit(100).get();
  const list = res.data.filter(p => p.archived !== true && Number.isInteger(p.priceCents) && p.priceCents > 0).map(viewProduct);
  const fileList = [...new Set(list.map(p => p.image).filter(src => typeof src === 'string' && src.startsWith('cloud://')))];
  if (fileList.length) {
    try {
      const resolved = await cloud.getTempFileURL({ fileList });
      const urls = new Map((resolved.fileList || []).filter(f => f.tempFileURL).map(f => [f.fileID, f.tempFileURL]));
      list.forEach(p => { if (urls.has(p.image)) p.image = urls.get(p.image); else if (p.image.startsWith('cloud://')) p.image = ''; });
    } catch (error) {
      console.error('resolve product images failed', error);
      list.forEach(p => { if (p.image.startsWith('cloud://')) p.image = ''; });
    }
  }
  return list;
}
function requestIdOf(input) {
  const requestId = requireText(input.requestId, 64, '请求标识');
  if (!/^[a-zA-Z0-9-]{12,64}$/.test(requestId)) throw new Error('请求标识格式不正确');
  return requestId;
}
async function createOrder(openid, input) {
  const settings = await readSettings();
  if (!enabled(settings)) throw new Error('目前不在营业配送时段，请稍后再试');
  const requestId = requestIdOf(input);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error('请选择商品');
  const quantities = new Map();
  for (const item of input.items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || quantities.has(item.id)) {
      throw new Error('商品数量或格式不正确');
    }
    quantities.set(item.id, item.quantity);
  }
  const id = crypto.createHash('sha256').update(`${openid}:${requestId}`).digest('hex').slice(0, 32);
  const existing = await orders.doc(id).get().catch(() => ({ data: null }));
  if (existing.data) {
    if (existing.data.customerOpenid !== openid) throw new Error('订单访问被拒绝');
    return viewOrder(existing.data);
  }
  const savedAddress = await getOwnAddress(openid, input.addressId);
  const { recipient, phone, building, room, contactPreference } = savedAddress;
  const address = `保利爱尚里 ${building}栋 ${room}`;
  const note = input.note ? requireText(input.note, 100, '备注') : '';
  const delivery = deliveryLabel(input.deliveryAt, settings);
  const lines = [];
  let subtotalCents = 0;
  for (const [productId, quantity] of quantities) {
    const { data: p } = await products.doc(productId).get().catch(() => ({ data: null }));
    if (!p || !p.is_available || p.archived === true || !Number.isInteger(p.priceCents) || p.priceCents < 1 || p.priceCents > 1000000) {
      throw new Error('商品已下架或尚未上架，请返回清单重试');
    }
    lines.push({ id: productId, name: p.name, spec: p.spec, quantity, priceCents: p.priceCents,
      subtotalCents: p.priceCents * quantity });
    subtotalCents += p.priceCents * quantity;
  }
  if (subtotalCents < settings.minOrderCents) throw new Error(`商品满${(settings.minOrderCents / 100).toFixed(2)}元起送`);
  const deliveryFeeCents = settings.deliveryFeeCents;
  const totalCents = subtotalCents + deliveryFeeCents;
  if (totalCents > 10000000) throw new Error('订单金额超出限制');
  if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== totalCents) {
    throw new Error('商品价格或配送费已变化，请返回重新确认订单金额');
  }
  const now = Date.now();
  const order = { _id: id, customerOpenid: openid, orderType: 'goods', recipient, phone, address, building, room,
    contactPreference, note, delivery, items: lines, subtotalCents, deliveryFeeCents, totalCents,
    status: 'pending', paymentMethod: 'cash_on_delivery',
    createdAt: now, updatedAt: now };
  try { await orders.add({ data: order }); }
  catch (error) {
    const saved = await orders.doc(id).get().catch(() => ({ data: null }));
    if (saved.data && saved.data.customerOpenid === openid) return viewOrder(saved.data);
    throw error;
  }
  return viewOrder(order);
}
async function createServiceOrder(openid, input) {
  const kind = requireText(input.type, 12, '服务类型');
  if (!ORDER_KINDS.includes(kind)) throw new Error('暂不支持该服务类型');
  const settings = await readSettings();
  if (!serviceOpen(settings, kind)) throw new Error(kind === 'express' ? '快递代取当前未开放，请查看服务时间' : '便利店代买当前未开放，请查看服务时间');
  const requestId = requestIdOf(input);
  const id = crypto.createHash('sha256').update(`${openid}:${requestId}`).digest('hex').slice(0, 32);
  const existing = await orders.doc(id).get().catch(() => ({ data: null }));
  if (existing.data) {
    if (existing.data.customerOpenid !== openid) throw new Error('订单访问被拒绝');
    return viewOrder(existing.data);
  }
  const savedAddress = await getOwnAddress(openid, input.addressId);
  const { recipient, phone, building, room, contactPreference } = savedAddress;
  const address = `保利爱尚里 ${building}栋 ${room}`;
  const note = optionalText(input.note, 100, '备注');
  const delivery = deliveryLabel(input.deliveryAt, settings);
  const now = Date.now();
  const base = { _id: id, customerOpenid: openid, orderType: kind, recipient, phone, address, building, room,
    contactPreference, note, delivery, status: 'pending', paymentMethod: 'cash_on_delivery',
    createdAt: now, updatedAt: now };
  let order;
  if (kind === 'express') {
    if (!Array.isArray(input.packages) || !input.packages.length || input.packages.length > EXPRESS_MAX_PACKAGES) {
      throw new Error(`一次最多代取${EXPRESS_MAX_PACKAGES}个包裹`);
    }
    const station = requireText(input.station, 20, '快递站点');
    const configured = stationList(settings);
    if (!configured.length) throw new Error('商家还没有配置快递站点，暂无法登记');
    if (!configured.includes(station)) throw new Error('请选择支持的快递站点');
    const packages = input.packages.map((item, index) => {
      const code = requireText(item && item.code, 32, `第${index + 1}个包裹的取件码`);
      if (!/^[0-9A-Za-z-]{4,32}$/.test(code)) throw new Error('取件码仅支持数字、字母和短横线');
      const phoneLast4 = requirePhoneTail(item && item.phoneLast4, phone);
      const size = PACKAGE_SIZES.includes(item && item.size) ? item.size : 'small';
      return { code, phoneLast4, size };
    });
    const serviceFeeCents = expressFeeCents(settings, packages);
    if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== serviceFeeCents) {
      throw new Error('代取费用已变化，请返回重新确认');
    }
    order = { ...base, station, packages, serviceFeeCents, subtotalCents: 0, deliveryFeeCents: 0, quoteCents: 0, totalCents: serviceFeeCents };
  } else {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > PURCHASE_MAX_ITEMS) {
      throw new Error(`代买清单最多${PURCHASE_MAX_ITEMS}项`);
    }
    const items = input.items.map((item, index) => {
      const name = requireText(item && item.name, 40, `第${index + 1}项商品名称`);
      const spec = optionalText(item && item.spec, 30, '商品规格');
      const quantity = item && item.quantity;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('商品数量需为1到20之间的整数');
      return { name, spec, quantity };
    });
    const budgetCents = input.budgetCents === undefined || input.budgetCents === null || input.budgetCents === '' ? 0 : input.budgetCents;
    if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 1000000) throw new Error('预估商品金额不正确');
    const serviceFeeCents = settings.purchaseFeeCents;
    if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== serviceFeeCents) {
      throw new Error('跑腿费用已变化，请返回重新确认');
    }
    order = { ...base, store: settings.purchaseStore || '京东便利店', purchaseItems: items,
      allowSubstitute: input.allowSubstitute === true, budgetCents,
      serviceFeeCents, subtotalCents: 0, deliveryFeeCents: 0, quoteCents: 0, totalCents: serviceFeeCents };
  }
  if (order.totalCents > 10000000) throw new Error('订单金额超出限制');
  try { await orders.add({ data: order }); }
  catch (error) {
    const saved = await orders.doc(id).get().catch(() => ({ data: null }));
    if (saved.data && saved.data.customerOpenid === openid) return viewOrder(saved.data);
    throw error;
  }
  return viewOrder(order);
}
// 店主报价：代买商品金额以实际门店为准，报价后由顾客确认
async function quoteServiceOrder(input, admin) {
  if (!admin) throw new Error('仅店主可报价');
  const id = requireText(input.id, 40, '订单编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('订单编号格式不正确');
  const quoteCents = input.quoteCents;
  if (!Number.isSafeInteger(quoteCents) || quoteCents < 0 || quoteCents > 1000000) throw new Error('商品报价不正确');
  const quoteNote = optionalText(input.quoteNote, 100, '报价说明');
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing) throw new Error('订单不存在');
  if (existing.orderType !== 'purchase') throw new Error('仅代买订单需要报价');
  if (!['pending', 'quoted'].includes(existing.status)) throw new Error('当前状态不可报价');
  const serviceFeeCents = Number.isSafeInteger(existing.serviceFeeCents) ? existing.serviceFeeCents : 0;
  const totalCents = quoteCents + serviceFeeCents;
  if (totalCents > 10000000) throw new Error('订单金额超出限制');
  const result = await orders.where({ _id: id, status: existing.status })
    .update({ data: { status: 'quoted', quoteCents, quoteNote, totalCents, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新重试');
  const { data: updated } = await orders.doc(id).get();
  return viewOrder(updated);
}
async function confirmQuote(openid, input) {
  const id = requireText(input.id, 40, '订单编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('订单编号格式不正确');
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing || existing.customerOpenid !== openid) throw new Error('订单不存在');
  if (existing.status !== 'quoted') throw new Error('当前订单无需确认报价');
  const result = await orders.where({ _id: id, status: 'quoted' })
    .update({ data: { status: 'processing', updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新重试');
  const { data: updated } = await orders.doc(id).get();
  return viewOrder(updated);
}
async function listOrders(openid, admin) {
  const filter = admin ? {} : { customerOpenid: openid, customerDeleted: db.command.neq(true) };
  const res = await orders.where(filter).orderBy('createdAt', 'desc').limit(50).get();
  return res.data.map(viewOrder);
}
// 顾客删除订单：仅隐藏自己的订单记录，店铺侧仍保留以便对账
async function deleteOrder(openid, input) {
  const id = requireText(input.id, 40, '订单编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('订单编号格式不正确');
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing || existing.customerOpenid !== openid) throw new Error('订单不存在');
  if (!['completed', 'cancelled'].includes(existing.status)) throw new Error('仅可删除已完成或已取消的订单');
  const result = await orders.where({ _id: id, customerOpenid: openid, status: existing.status })
    .update({ data: { customerDeleted: true, customerDeletedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新后重试');
  return { id };
}
async function changeStatus(openid, input, admin) {
  const id = requireText(input.id, 40, '订单编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('订单编号格式不正确');
  const status = requireText(input.status, 20, '订单状态');
  if (!Object.prototype.hasOwnProperty.call(STATUS, status)) throw new Error('无效的订单状态');
  const { data: existing } = await orders.doc(id).get().catch(() => ({ data: null }));
  if (!existing || (!admin && existing.customerOpenid !== openid)) throw new Error('订单不存在');
  if (!admin && !(existing.status === 'pending' && status === 'cancelled')) throw new Error('仅可取消待确认订单');
  if (!(NEXT[existing.status] || []).includes(status)) throw new Error('订单状态已变化，请刷新后重试');
  const result = await orders.where({ _id: id, status: existing.status }).update({ data: { status, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('订单状态已变化，请刷新后重试');
  const { data: updated } = await orders.doc(id).get();
  return viewOrder(updated);
}
function viewShare(doc, mine) {
  const priceCents = Number.isSafeInteger(doc.priceCents) ? doc.priceCents : 0;
  return { id: doc._id, title: doc.title, description: doc.description, condition: doc.condition,
    conditionText: SHARE_CONDITIONS[doc.condition] || doc.condition, mode: doc.mode,
    modeText: SHARE_MODES[doc.mode] || doc.mode, priceCents, price: money(priceCents),
    images: Array.isArray(doc.images) ? doc.images.slice(0, 3) : [], meetup: doc.meetup,
    status: doc.status, statusText: SHARE_STATUS[doc.status] || doc.status,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt, isMine: !!mine,
    rejectReason: mine ? doc.rejectReason || '' : '' };
}
async function listShares(openid, input) {
  const scope = input && input.scope === 'mine' ? 'mine' : 'all';
  if (scope === 'mine') {
    const res = await shares.where({ ownerOpenid: openid }).orderBy('updatedAt', 'desc').limit(30).get();
    return res.data.map(doc => viewShare(doc, true));
  }
  const res = await shares.where({ status: 'approved' }).orderBy('createdAt', 'desc').limit(50).get();
  return res.data.map(doc => viewShare(doc, doc.ownerOpenid === openid));
}
async function getShare(openid, input) {
  const id = requireText(input.id, 40, '物品编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('物品编号格式不正确');
  const { data } = await shares.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('物品不存在或已下架');
  const mine = data.ownerOpenid === openid;
  if (data.status !== 'approved' && !mine) throw new Error('物品不存在或已下架');
  return viewShare(data, mine);
}
async function createShare(openid, input) {
  const title = requireText(input.title, 40, '物品名称');
  const description = requireText(input.description, 200, '物品描述');
  const condition = requireText(input.condition, 10, '成色');
  if (!SHARE_CONDITIONS[condition]) throw new Error('请选择物品成色');
  const mode = requireText(input.mode, 10, '分享方式');
  if (!SHARE_MODES[mode]) throw new Error('请选择分享方式');
  const meetup = requireText(input.meetup, 40, '交接地点');
  let priceCents = 0;
  if (mode === 'sale') {
    priceCents = input.priceCents;
    if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 1000000) throw new Error('请填写有效的转让价格');
  }
  const images = Array.isArray(input.images) ? input.images.slice(0, 3) : [];
  if (images.length > 3) throw new Error('最多上传3张图片');
  for (const image of images) {
    if (typeof image !== 'string' || !SHARE_IMAGE.test(image)) throw new Error('物品图片不正确，请重新上传');
  }
  const { total } = await shares.where({ ownerOpenid: openid }).count();
  if (total >= SHARE_LIMIT) throw new Error(`最多发布${SHARE_LIMIT}件物品，请先下架不再分享的物品`);
  const id = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  // 发布即公开，不再需要店主审核；违规内容由管理端下架
  const doc = { _id: id, ownerOpenid: openid, title, description, condition, mode, priceCents,
    images, meetup, status: 'approved', createdAt: now, updatedAt: now };
  await shares.add({ data: doc });
  return viewShare(doc, true);
}
async function updateShare(openid, input) {
  const id = requireText(input.id, 40, '物品编号');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('物品编号格式不正确');
  const status = requireText(input.status, 10, '物品状态');
  if (!['approved', 'off', 'taken'].includes(status)) throw new Error('不支持的物品状态');
  const { data: existing } = await shares.doc(id).get().catch(() => ({ data: null }));
  if (!existing || existing.ownerOpenid !== openid) throw new Error('物品不存在');
  const result = await shares.where({ _id: id, ownerOpenid: openid })
    .update({ data: { status, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('更新失败，请重试');
  return { id, status };
}

/* ---------- 邻里广场：帖子与评论 ---------- */
// 广场不展示真实身份，用 openid 派生一个稳定的匿名昵称
function forumAlias(openid) {
  const digest = crypto.createHash('md5').update(`snack-forum:${openid}`).digest('hex');
  return `邻居${digest.slice(0, 4).toUpperCase()}`;
}
// 用户发布内容必须过内容安全检测；接口不可用时记录日志，不影响正常邻里交流
async function forumSecCheck(content) {
  let result;
  try {
    result = await cloud.openapi.security.msgSecCheck({ content });
  } catch (error) {
    if (error && error.errCode === 87014) throw new Error('内容可能包含违规信息，请修改后再发布');
    console.warn('msgSecCheck unavailable', error && (error.errCode || error.message));
    return;
  }
  const suggest = result && result.result && result.result.suggest;
  if (suggest && suggest !== 'pass') throw new Error('内容可能包含违规信息，请修改后再发布');
}
function forumId(input, label) {
  const id = requireText(input.id, 40, label);
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error(`${label}格式不正确`);
  return id;
}
function viewPost(doc, openid, full) {
  const likedBy = Array.isArray(doc.likedBy) ? doc.likedBy : [];
  return { id: doc._id, board: doc.board, title: doc.title,
    content: full ? doc.content : String(doc.content || '').slice(0, 200),
    images: Array.isArray(doc.images) ? doc.images.slice(0, FORUM_IMAGE_MAX) : [],
    author: doc.authorAlias || '邻居',
    likeCount: Number.isSafeInteger(doc.likeCount) ? doc.likeCount : likedBy.length,
    commentCount: Number.isSafeInteger(doc.commentCount) ? doc.commentCount : 0,
    liked: likedBy.includes(openid), pinned: doc.pinned === true,
    isMine: doc.authorOpenid === openid, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}
function viewComment(doc, openid) {
  return { id: doc._id, postId: doc.postId, content: doc.content,
    author: doc.authorAlias || '邻居', isMine: doc.authorOpenid === openid, createdAt: doc.createdAt };
}
async function listPosts(openid, input) {
  const board = input.board === undefined || input.board === null || input.board === '' || input.board === 'all'
    ? '' : requireText(input.board, 12, '板块');
  if (board && !FORUM_BOARDS.includes(board)) throw new Error('未找到该板块');
  const page = Number.isSafeInteger(input.page) && input.page >= 0 && input.page < 200 ? input.page : 0;
  const where = board ? { status: 'approved', board } : { status: 'approved' };
  const res = await posts.where(where).orderBy('pinned', 'desc').orderBy('createdAt', 'desc')
    .skip(page * FORUM_PAGE_SIZE).limit(FORUM_PAGE_SIZE).get();
  return res.data.map(doc => viewPost(doc, openid, false));
}
async function getPost(openid, input) {
  const id = forumId(input, '帖子编号');
  const { data } = await posts.doc(id).get().catch(() => ({ data: null }));
  if (!data) throw new Error('帖子不存在或已删除');
  if (data.status !== 'approved' && data.authorOpenid !== openid) throw new Error('帖子不存在或已删除');
  return viewPost(data, openid, true);
}
async function createPost(openid, input, admin) {
  const board = requireText(input.board, 12, '板块');
  if (!FORUM_BOARDS.includes(board)) throw new Error('请选择要发布的板块');
  // 公告类内容只由社区管理方发布，避免冒充
  if (FORUM_OWNER_BOARDS.includes(board) && !admin) throw new Error('社区公告仅由社区管理方发布');
  const title = requireText(input.title, FORUM_TITLE_MAX, '标题');
  const content = requireText(input.content, FORUM_CONTENT_MAX, '正文');
  const images = Array.isArray(input.images) ? input.images.slice(0, FORUM_IMAGE_MAX) : [];
  for (const image of images) {
    if (typeof image !== 'string' || !FORUM_IMAGE.test(image)) throw new Error('帖子图片不正确，请重新上传');
  }
  await forumSecCheck(`${title}\n${content}`);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const { total } = await posts.where({ authorOpenid: openid, createdAt: dbCommand.gte(since) }).count();
  if (total >= FORUM_DAILY_POSTS) throw new Error(`24 小时内最多发布 ${FORUM_DAILY_POSTS} 条帖子`);
  const now = Date.now();
  const doc = { _id: crypto.randomBytes(16).toString('hex'), board, title, content, images,
    authorOpenid: openid, authorAlias: forumAlias(openid), likeCount: 0, likedBy: [],
    commentCount: 0, status: 'approved', pinned: false, createdAt: now, updatedAt: now };
  await posts.add({ data: doc });
  return viewPost(doc, openid, true);
}
async function deletePost(openid, input, admin) {
  const id = forumId(input, '帖子编号');
  const { data: existing } = await posts.doc(id).get().catch(() => ({ data: null }));
  if (!existing) throw new Error('帖子不存在或已删除');
  if (existing.authorOpenid !== openid && !admin) throw new Error('只能删除自己发布的帖子');
  await posts.doc(id).remove();
  await comments.where({ postId: id }).remove();
  return { id };
}
async function toggleLike(openid, input) {
  const id = forumId(input, '帖子编号');
  const { data: existing } = await posts.doc(id).get().catch(() => ({ data: null }));
  if (!existing || existing.status !== 'approved') throw new Error('帖子不存在或已删除');
  const likedBy = Array.isArray(existing.likedBy) ? existing.likedBy : [];
  const liked = likedBy.includes(openid);
  if (!liked && likedBy.length >= FORUM_LIKE_CAP) throw new Error('点赞人数已达上限');
  const next = liked ? likedBy.filter(item => item !== openid) : likedBy.concat(openid);
  const result = await posts.doc(id).update({ data: { likedBy: next, likeCount: next.length, updatedAt: Date.now() } });
  if (!result.stats || result.stats.updated !== 1) throw new Error('操作失败，请重试');
  return { id, liked: !liked, likeCount: next.length };
}
async function listComments(openid, input) {
  const postId = forumId({ id: input.postId }, '帖子编号');
  const res = await comments.where({ postId, status: 'approved' }).orderBy('createdAt', 'asc').limit(100).get();
  return res.data.map(doc => viewComment(doc, openid));
}
async function createComment(openid, input) {
  const postId = forumId({ id: input.postId }, '帖子编号');
  const content = requireText(input.content, FORUM_COMMENT_MAX, '评论');
  const { data: post } = await posts.doc(postId).get().catch(() => ({ data: null }));
  if (!post || post.status !== 'approved') throw new Error('帖子不存在或已删除');
  await forumSecCheck(content);
  const since = Date.now() - FORUM_WINDOW_MS;
  const { total } = await comments.where({ authorOpenid: openid, createdAt: dbCommand.gte(since) }).count();
  if (total >= FORUM_WINDOW_COMMENTS) throw new Error('发言有点快，休息一下再试');
  const now = Date.now();
  const doc = { _id: crypto.randomBytes(16).toString('hex'), postId, content,
    authorOpenid: openid, authorAlias: forumAlias(openid), status: 'approved', createdAt: now };
  await comments.add({ data: doc });
  await posts.doc(postId).update({ data: { commentCount: dbCommand.inc(1), updatedAt: now } }).catch(() => {});
  return viewComment(doc, openid);
}
async function deleteComment(openid, input, admin) {
  const id = forumId(input, '评论编号');
  const { data: existing } = await comments.doc(id).get().catch(() => ({ data: null }));
  if (!existing) throw new Error('评论不存在或已删除');
  if (existing.authorOpenid !== openid && !admin) throw new Error('只能删除自己的评论');
  await comments.doc(id).remove();
  await posts.doc(existing.postId).update({ data: { commentCount: dbCommand.inc(-1) } }).catch(() => {});
  return { id };
}

/* ---------- 个人资料：昵称与头像 ---------- */
// 头像只允许使用云存储地址，避免前端塞入任意外链
const AVATAR_IMAGE = /^cloud:\/\/[a-zA-Z0-9._-]+\/avatar\/[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/;
async function getProfile(openid) {
  const { data } = await profiles.doc(openid).get().catch(() => ({ data: null }));
  return {
    nickName: data && typeof data.nickName === 'string' ? data.nickName : '',
    avatarUrl: data && typeof data.avatarUrl === 'string' ? data.avatarUrl : ''
  };
}
async function saveProfile(openid, input) {
  const nickName = typeof input.nickName === 'string' ? input.nickName.trim().slice(0, 24) : '';
  if (nickName && nickName.length < 2) throw new Error('昵称至少 2 个字');
  if (nickName) await forumSecCheck(`昵称 ${nickName}`);
  const avatarUrl = typeof input.avatarUrl === 'string' ? input.avatarUrl.trim() : '';
  if (avatarUrl && !AVATAR_IMAGE.test(avatarUrl)) throw new Error('头像不正确，请重新上传');
  const data = { nickName, avatarUrl, updatedAt: Date.now() };
  const { data: existing } = await profiles.doc(openid).get().catch(() => ({ data: null }));
  if (existing) {
    await profiles.doc(openid).update({ data });
  } else {
    await profiles.doc(openid).set({ data: { _id: openid, ...data, createdAt: Date.now() } });
  }
  return data;
}

// 集合缺失时云开发返回的是英文错误，转成用户能看懂的提示
function friendlyMessage(error) {
  const raw = (error && (error.message || error.errMsg)) || '';
  if ((error && error.errCode === -502005) || /collection.*not\s*exist|db not exist/i.test(raw)) {
    return '社区数据还在初始化，请稍后重试';
  }
  return raw || '服务暂不可用';
}

// 未登录游客允许调用的只读接口；其余一律拒绝，避免越权写入
const GUEST_ACTIONS = new Set(['getCatalog', 'listPosts', 'getPost', 'listComments', 'listShares', 'getShare']);
const GUEST_UID = 'guest';
// 不同调用链路（小程序 / RN / Web 云调用）把登录身份放在不同位置，这里一并取，
// 取到任意一个可信来源即可；身份必须由服务端读取，绝不能信任客户端传入的字段
function cloudbaseUid(context) {
  let uid = '';
  try { uid = (cloudbaseAuth.getUserInfo && cloudbaseAuth.getUserInfo())?.uid || ''; } catch (e) { /* 忽略，走 context 兜底 */ }
  if (!uid && context) {
    const info = context.userInfo || {};
    uid = info.uid || info.userId || (context.cloudbaseContext && context.cloudbaseContext.uid) || '';
  }
  return uid;
}

exports.main = async (event, context) => {
  const action = event && event.action;
  let openid = (cloud.getWXContext() || {}).OPENID || '';
  let identitySource = 'wechat';
  if (!openid) {
    const uid = cloudbaseUid(context);
    if (uid) {
      openid = `rn_${uid}`; // 与微信 openid 区分，避免跨端身份串号
      identitySource = 'cloudbase';
    } else if (process.env.MOBILE_GUEST_READ === '1' && GUEST_ACTIONS.has(action)) {
      openid = GUEST_UID;
      identitySource = 'guest';
    } else {
      return { ok: false, message: '请在微信小程序中打开，或在移动端先登录' };
    }
  }
  if (identitySource === 'guest' && !GUEST_ACTIONS.has(action)) {
    return { ok: false, message: '游客仅可浏览，请先登录后再操作' };
  }
  if (identitySource !== 'wechat') {
    console.log('snackShop non-wechat identity', { action, identitySource });
  }
  const input = event && event.data && typeof event.data === 'object' ? event.data : {};
  try {
    await ensureCollections();
    const settings = await readSettings();
    // 店主身份只在小程序链路下判定，移动端用户一律按普通用户处理
    const admin = identitySource === 'wechat' && owner(openid, settings);
    switch (action) {
      case 'getContext': return { ok: true, data: { isOwner: admin, ...publicSettings(settings), ownOpenid: openid } };
      case 'getProfile': return { ok: true, data: await getProfile(openid) };
      case 'saveProfile': return { ok: true, data: await saveProfile(openid, input) };
      case 'getCatalog': return { ok: true, data: await getCatalog() };
      case 'listAddresses': return { ok: true, data: await listAddresses(openid) };
      case 'saveAddress': return { ok: true, data: await saveAddress(openid, input) };
      case 'deleteAddress': return { ok: true, data: await deleteAddress(openid, input) };
      case 'createOrder': return { ok: true, data: await createOrder(openid, input) };
      case 'createServiceOrder': return { ok: true, data: await createServiceOrder(openid, input) };
      case 'quoteServiceOrder': return { ok: true, data: await quoteServiceOrder(input, admin) };
      case 'confirmQuote': return { ok: true, data: await confirmQuote(openid, input) };
      case 'listOrders': return { ok: true, data: await listOrders(openid, input.asOwner === true && admin) };
      case 'changeStatus': return { ok: true, data: await changeStatus(openid, input, admin) };
      case 'deleteOrder': return { ok: true, data: await deleteOrder(openid, input) };
      case 'listShares': return { ok: true, data: await listShares(openid, input) };
      case 'getShare': return { ok: true, data: await getShare(openid, input) };
      case 'createShare': return { ok: true, data: await createShare(openid, input) };
      case 'updateShare': return { ok: true, data: await updateShare(openid, input) };
      case 'listPosts': return { ok: true, data: await listPosts(openid, input) };
      case 'getPost': return { ok: true, data: await getPost(openid, input) };
      case 'createPost': return { ok: true, data: await createPost(openid, input, admin) };
      case 'deletePost': return { ok: true, data: await deletePost(openid, input, admin) };
      case 'toggleLike': return { ok: true, data: await toggleLike(openid, input) };
      case 'listComments': return { ok: true, data: await listComments(openid, input) };
      case 'createComment': return { ok: true, data: await createComment(openid, input) };
      case 'deleteComment': return { ok: true, data: await deleteComment(openid, input, admin) };
      default: return { ok: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('snackShop request failed', event && event.action, error);
    return { ok: false, message: friendlyMessage(error) };
  }
};
