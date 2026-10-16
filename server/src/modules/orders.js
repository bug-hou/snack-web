import crypto from 'node:crypto';
import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import {
  requireText, optionalText, requireCents, requireHex32, money, requirePhoneTail
} from '../core/validate.js';
import {
  STATUS, NEXT, ORDER_KINDS, EXPRESS_MAX_PACKAGES, PURCHASE_MAX_ITEMS,
  PACKAGE_SIZES, DELIVERY_STEP_MS, DELIVERY_MAX_MS
} from '../core/constants.js';
import { formatBeijing } from '../core/time.js';
import { readSettings, enabled, serviceOpen, expressFeeCents, stationList } from './settings.js';
import { getOwnAddress } from './addresses.js';
import { assertSellable } from './catalog.js';

/** 期望送达时间 → 展示文案；0 表示尽快送达 */
function deliveryLabel(deliveryAt, settings) {
  if (deliveryAt === 0 || deliveryAt === undefined || deliveryAt === null) return '尽快送达';
  if (!Number.isSafeInteger(deliveryAt) || deliveryAt % DELIVERY_STEP_MS !== 0) {
    throw new AppError('期望送达时间不正确');
  }
  const now = Date.now();
  if (deliveryAt < now) throw new AppError('期望送达时间已过，请重新选择');
  if (deliveryAt > now + DELIVERY_MAX_MS) throw new AppError('期望送达时间最多可选未来7天');
  const { date, clock } = formatBeijing(deliveryAt);
  if (clock < settings.deliveryStart || clock > settings.deliveryEnd) {
    throw new AppError(`期望送达时间需在配送时段 ${settings.deliveryStart}—${settings.deliveryEnd} 内`);
  }
  return `期望 ${date} ${clock} 送达`;
}

function requestIdOf(input) {
  const requestId = requireText(input.requestId, 64, '请求标识');
  if (!/^[a-zA-Z0-9-]{12,64}$/.test(requestId)) throw new AppError('请求标识格式不正确');
  return requestId;
}

/** 幂等键：同一用户对同一请求标识只生成一张订单 */
function idempotentId(userId, requestId) {
  return crypto.createHash('sha256').update(`${userId}:${requestId}`).digest('hex').slice(0, 32);
}

export function viewOrder(o) {
  const orderType = o.orderType === 'express' || o.orderType === 'purchase' ? o.orderType : 'goods';
  const deliveryFeeCents = Number.isSafeInteger(o.deliveryFeeCents) ? o.deliveryFeeCents : 0;
  const subtotalCents = Number.isSafeInteger(o.subtotalCents) ? o.subtotalCents : o.totalCents;
  const serviceFeeCents = Number.isSafeInteger(o.serviceFeeCents) ? o.serviceFeeCents : 0;
  const quoteCents = Number.isSafeInteger(o.quoteCents) ? o.quoteCents : 0;
  const packages = Array.isArray(o.packages)
    ? o.packages.map((p) => ({ code: p.code, phoneLast4: p.phoneLast4, size: p.size }))
    : [];
  const purchaseItems = Array.isArray(o.purchaseItems) ? o.purchaseItems.map((item) => ({ ...item })) : [];
  return {
    id: o._id,
    orderType,
    orderTypeText: orderType === 'express' ? '快递代取' : orderType === 'purchase' ? '便利店代买' : '便利铺现货',
    items: o.items || [],
    purchaseItems,
    packages,
    station: o.station || '',
    store: o.store || '',
    allowSubstitute: !!o.allowSubstitute,
    budgetCents: Number.isSafeInteger(o.budgetCents) ? o.budgetCents : 0,
    quoteCents,
    quote: money(quoteCents),
    quoteNote: o.quoteNote || '',
    subtotalCents,
    deliveryFeeCents,
    serviceFeeCents,
    subtotal: money(subtotalCents),
    deliveryFee: money(deliveryFeeCents),
    serviceFee: money(serviceFeeCents),
    totalCents: o.totalCents,
    total: money(o.totalCents),
    status: o.status,
    statusText: STATUS[o.status],
    recipient: o.recipient,
    phone: o.phone,
    address: o.address,
    building: o.building || '',
    room: o.room || '',
    contactPreference: o.contactPreference || 'knock',
    delivery: o.delivery,
    note: o.note,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    paymentMethod: '线下结算'
  };
}

/** 现货订单 */
export async function createOrder(userId, input) {
  const settings = await readSettings();
  if (!enabled(settings)) throw new AppError('目前不在营业配送时段，请稍后再试');

  const requestId = requestIdOf(input);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) {
    throw new AppError('请选择商品');
  }

  const quantities = new Map();
  for (const item of input.items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || quantities.has(item.id)) {
      throw new AppError('商品数量或格式不正确');
    }
    quantities.set(item.id, item.quantity);
  }

  const id = idempotentId(userId, requestId);
  const existing = await col.orders.findOne({ _id: id });
  if (existing) {
    if (existing.customerId !== userId) throw new AppError('订单访问被拒绝');
    return viewOrder(existing);
  }

  const savedAddress = await getOwnAddress(userId, input.addressId);
  const { recipient, phone, building, room, contactPreference } = savedAddress;
  const address = `保利爱尚里 ${building}栋 ${room}`;
  const note = input.note ? requireText(input.note, 100, '备注') : '';
  const delivery = deliveryLabel(input.deliveryAt, settings);

  const lines = [];
  let subtotalCents = 0;
  for (const [productId, quantity] of quantities) {
    const p = await assertSellable(productId);
    lines.push({
      id: productId,
      name: p.name,
      spec: p.spec,
      quantity,
      priceCents: p.priceCents,
      subtotalCents: p.priceCents * quantity
    });
    subtotalCents += p.priceCents * quantity;
  }

  if (subtotalCents < settings.minOrderCents) {
    throw new AppError(`商品满${(settings.minOrderCents / 100).toFixed(2)}元起送`);
  }

  const deliveryFeeCents = settings.deliveryFeeCents;
  const totalCents = subtotalCents + deliveryFeeCents;
  if (totalCents > 10000000) throw new AppError('订单金额超出限制');
  if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== totalCents) {
    throw new AppError('商品价格或配送费已变化，请返回重新确认订单金额');
  }

  const now = Date.now();
  const order = {
    _id: id,
    customerId: userId,
    orderType: 'goods',
    recipient, phone, address, building, room, contactPreference, note, delivery,
    items: lines,
    subtotalCents,
    deliveryFeeCents,
    totalCents,
    status: 'pending',
    paymentMethod: 'cash_on_delivery',
    createdAt: now,
    updatedAt: now
  };

  try {
    await col.orders.insertOne(order);
  } catch (error) {
    // 唯一键冲突说明并发重复提交，回读即可
    const saved = await col.orders.findOne({ _id: id });
    if (saved && saved.customerId === userId) return viewOrder(saved);
    throw error;
  }
  return viewOrder(order);
}

/** 服务单：快递代取 / 便利店代买 */
export async function createServiceOrder(userId, input) {
  const kind = requireText(input.type, 12, '服务类型');
  if (!ORDER_KINDS.includes(kind)) throw new AppError('暂不支持该服务类型');

  const settings = await readSettings();
  if (!serviceOpen(settings, kind)) {
    throw new AppError(kind === 'express' ? '快递代取当前未开放，请查看服务时间' : '便利店代买当前未开放，请查看服务时间');
  }

  const requestId = requestIdOf(input);
  const id = idempotentId(userId, requestId);
  const existing = await col.orders.findOne({ _id: id });
  if (existing) {
    if (existing.customerId !== userId) throw new AppError('订单访问被拒绝');
    return viewOrder(existing);
  }

  const savedAddress = await getOwnAddress(userId, input.addressId);
  const { recipient, phone, building, room, contactPreference } = savedAddress;
  const address = `保利爱尚里 ${building}栋 ${room}`;
  const note = optionalText(input.note, 100, '备注');
  const delivery = deliveryLabel(input.deliveryAt, settings);
  const now = Date.now();

  const base = {
    _id: id,
    customerId: userId,
    orderType: kind,
    recipient, phone, address, building, room, contactPreference, note, delivery,
    status: 'pending',
    paymentMethod: 'cash_on_delivery',
    createdAt: now,
    updatedAt: now
  };

  let order;
  if (kind === 'express') {
    if (!Array.isArray(input.packages) || !input.packages.length || input.packages.length > EXPRESS_MAX_PACKAGES) {
      throw new AppError(`一次最多代取${EXPRESS_MAX_PACKAGES}个包裹`);
    }
    const station = requireText(input.station, 20, '快递站点');
    const configured = stationList(settings);
    if (!configured.length) throw new AppError('商家还没有配置快递站点，暂无法登记');
    if (!configured.includes(station)) throw new AppError('请选择支持的快递站点');

    const packages = input.packages.map((item, index) => {
      const code = requireText(item && item.code, 32, `第${index + 1}个包裹的取件码`);
      if (!/^[0-9A-Za-z-]{4,32}$/.test(code)) throw new AppError('取件码仅支持数字、字母和短横线');
      const phoneLast4 = requirePhoneTail(item && item.phoneLast4, phone);
      const size = PACKAGE_SIZES.includes(item && item.size) ? item.size : 'small';
      return { code, phoneLast4, size };
    });

    const serviceFeeCents = expressFeeCents(settings, packages);
    if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== serviceFeeCents) {
      throw new AppError('代取费用已变化，请返回重新确认');
    }
    order = { ...base, station, packages, serviceFeeCents, subtotalCents: 0, deliveryFeeCents: 0, quoteCents: 0, totalCents: serviceFeeCents };
  } else {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > PURCHASE_MAX_ITEMS) {
      throw new AppError(`代买清单最多${PURCHASE_MAX_ITEMS}项`);
    }
    const items = input.items.map((item, index) => {
      const name = requireText(item && item.name, 40, `第${index + 1}项商品名称`);
      const spec = optionalText(item && item.spec, 30, '商品规格');
      const quantity = item && item.quantity;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new AppError('商品数量需为1到20之间的整数');
      }
      return { name, spec, quantity };
    });

    const budgetCents = input.budgetCents === undefined || input.budgetCents === null || input.budgetCents === ''
      ? 0 : input.budgetCents;
    if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 1000000) {
      throw new AppError('预估商品金额不正确');
    }

    const serviceFeeCents = settings.purchaseFeeCents;
    if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== serviceFeeCents) {
      throw new AppError('跑腿费用已变化，请返回重新确认');
    }
    order = {
      ...base,
      store: settings.purchaseStore || '京东便利店',
      purchaseItems: items,
      allowSubstitute: input.allowSubstitute === true,
      budgetCents,
      serviceFeeCents,
      subtotalCents: 0,
      deliveryFeeCents: 0,
      quoteCents: 0,
      totalCents: serviceFeeCents
    };
  }

  if (order.totalCents > 10000000) throw new AppError('订单金额超出限制');

  try {
    await col.orders.insertOne(order);
  } catch (error) {
    const saved = await col.orders.findOne({ _id: id });
    if (saved && saved.customerId === userId) return viewOrder(saved);
    throw error;
  }
  return viewOrder(order);
}

export async function listOrders(userId) {
  const list = await col.orders
    .find({ customerId: userId, customerDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return list.map(viewOrder);
}

/** 顾客删除订单：仅隐藏自己的记录，店铺侧仍保留以便对账 */
export async function deleteOrder(userId, input) {
  const id = requireHex32(input.id, '订单编号');
  const existing = await col.orders.findOne({ _id: id });
  if (!existing || existing.customerId !== userId) throw new AppError('订单不存在');
  if (!['completed', 'cancelled'].includes(existing.status)) {
    throw new AppError('仅可删除已完成或已取消的订单');
  }
  const result = await col.orders.updateOne(
    { _id: id, customerId: userId, status: existing.status },
    { $set: { customerDeleted: true, customerDeletedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新后重试');
  return { id };
}

/** 店主报价：代买商品金额以实际门店为准，报价后由顾客确认 */
export async function quoteServiceOrder(input, isAdmin) {
  if (!isAdmin) throw new AppError('仅店主可报价');
  const id = requireHex32(input.id, '订单编号');
  const quoteCents = input.quoteCents;
  if (!Number.isSafeInteger(quoteCents) || quoteCents < 0 || quoteCents > 1000000) {
    throw new AppError('商品报价不正确');
  }
  const quoteNote = optionalText(input.quoteNote, 100, '报价说明');

  const existing = await col.orders.findOne({ _id: id });
  if (!existing) throw new AppError('订单不存在');
  if (existing.orderType !== 'purchase') throw new AppError('仅代买订单需要报价');
  if (!['pending', 'quoted'].includes(existing.status)) throw new AppError('当前状态不可报价');

  const serviceFeeCents = Number.isSafeInteger(existing.serviceFeeCents) ? existing.serviceFeeCents : 0;
  const totalCents = quoteCents + serviceFeeCents;
  if (totalCents > 10000000) throw new AppError('订单金额超出限制');

  const result = await col.orders.updateOne(
    { _id: id, status: existing.status },
    { $set: { status: 'quoted', quoteCents, quoteNote, totalCents, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新重试');
  return viewOrder(await col.orders.findOne({ _id: id }));
}

export async function confirmQuote(userId, input) {
  const id = requireHex32(input.id, '订单编号');
  const existing = await col.orders.findOne({ _id: id });
  if (!existing || existing.customerId !== userId) throw new AppError('订单不存在');
  if (existing.status !== 'quoted') throw new AppError('当前订单无需确认报价');

  const result = await col.orders.updateOne(
    { _id: id, status: 'quoted' },
    { $set: { status: 'processing', updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新重试');
  return viewOrder(await col.orders.findOne({ _id: id }));
}

export async function changeStatus(userId, input, isAdmin) {
  const id = requireHex32(input.id, '订单编号');
  const status = requireText(input.status, 20, '订单状态');
  if (!Object.prototype.hasOwnProperty.call(STATUS, status)) throw new AppError('无效的订单状态');

  const existing = await col.orders.findOne({ _id: id });
  if (!existing || (!isAdmin && existing.customerId !== userId)) throw new AppError('订单不存在');
  if (!isAdmin && !(existing.status === 'pending' && status === 'cancelled')) {
    throw new AppError('仅可取消待确认订单');
  }
  if (!(NEXT[existing.status] || []).includes(status)) {
    throw new AppError('订单状态已变化，请刷新后重试');
  }

  const result = await col.orders.updateOne(
    { _id: id, status: existing.status },
    { $set: { status, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('订单状态已变化，请刷新后重试');
  return viewOrder(await col.orders.findOne({ _id: id }));
}
