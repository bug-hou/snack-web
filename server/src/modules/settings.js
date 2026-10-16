import { col, SETTINGS_ID } from '../db.js';
import { DEFAULT_SETTINGS, SHARE_MAX_STATIONS } from '../core/constants.js';
import { clockNow } from '../core/time.js';

/** 读取店铺设置，缺失时回落到默认值 */
export async function readSettings() {
  const doc = await col.settings.findOne({ _id: SETTINGS_ID });
  return { ...DEFAULT_SETTINGS, ...(doc || {}) };
}

export async function writeSettings(next) {
  await col.settings.updateOne({ _id: SETTINGS_ID }, { $set: { ...next, updatedAt: Date.now() } }, { upsert: true });
  return readSettings();
}

export function stationList(settings) {
  return Array.isArray(settings.expressStations)
    ? settings.expressStations.filter((s) => typeof s === 'string' && s.trim()).slice(0, SHARE_MAX_STATIONS)
    : [];
}

/** 现货订单是否可下单：营业开关 + 营业时段 + 配送时段 */
export function enabled(settings) {
  const current = clockNow();
  return settings.ordersEnabled === true &&
    current >= settings.businessStart && current < settings.businessEnd &&
    current >= settings.deliveryStart && current < settings.deliveryEnd;
}

/** 代取可以跟随店铺营业时间，避免和店铺营业状态不一致 */
export function serviceWindow(settings, kind) {
  if (kind === 'express' && settings.expressFollowShop === true) {
    return { start: settings.businessStart, end: settings.businessEnd };
  }
  return { start: settings[`${kind}Start`], end: settings[`${kind}End`] };
}

export function serviceOpen(settings, kind) {
  const { start, end } = serviceWindow(settings, kind);
  const current = clockNow();
  return settings[`${kind}Enabled`] === true && current >= start && current < end;
}

/** 代取费用 = 基础跑腿费（含首件）+ 每多一件加价 + 每个大件加价 */
export function expressFeeCents(settings, packages) {
  const largeCount = packages.filter((pkg) => pkg.size === 'large').length;
  return settings.expressBaseFeeCents +
    settings.expressExtraFeeCents * Math.max(packages.length - 1, 0) +
    settings.expressLargeFeeCents * largeCount;
}

/** 下发给客户端的公开设置（不泄露店主标识等内部字段） */
export function publicSettings(settings) {
  return {
    isOpen: enabled(settings),
    ordersEnabled: settings.ordersEnabled === true,
    businessStart: settings.businessStart,
    businessEnd: settings.businessEnd,
    deliveryStart: settings.deliveryStart,
    deliveryEnd: settings.deliveryEnd,
    deliveryFeeCents: settings.deliveryFeeCents,
    minOrderCents: settings.minOrderCents,
    ownerWechat: typeof settings.ownerWechat === 'string' ? settings.ownerWechat : '',
    express: {
      enabled: serviceOpen(settings, 'express'),
      configured: settings.expressEnabled === true,
      baseFeeCents: settings.expressBaseFeeCents,
      extraFeeCents: settings.expressExtraFeeCents,
      largeFeeCents: settings.expressLargeFeeCents,
      followShop: settings.expressFollowShop === true,
      start: serviceWindow(settings, 'express').start,
      end: serviceWindow(settings, 'express').end,
      stations: stationList(settings)
    },
    purchase: {
      enabled: serviceOpen(settings, 'purchase'),
      configured: settings.purchaseEnabled === true,
      feeCents: settings.purchaseFeeCents,
      start: settings.purchaseStart,
      end: settings.purchaseEnd,
      store: typeof settings.purchaseStore === 'string' && settings.purchaseStore ? settings.purchaseStore : '京东便利店'
    },
    secondhand: { enabled: settings.secondhandEnabled === true }
  };
}
