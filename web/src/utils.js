export const ORDER_STATUS = {
  pending: '待处理', quoted: '待确认报价', processing: '订单处理中', confirmed: '订单处理中',
  packed: '配货完成', delivering: '配送中', completed: '配送完成', cancelled: '已取消'
};
export const STATUS_TONE = {
  pending: 'amber', quoted: 'amber', processing: 'blue', confirmed: 'blue',
  packed: 'blue', delivering: 'blue', completed: 'green', cancelled: 'grey'
};
// 每种状态下店主可以做的主操作（第一个是推进，第二个是取消）
export const NEXT_ACTION = {
  pending: ['processing', '开始处理'],
  processing: ['packed', '完成配货'],
  confirmed: ['packed', '完成配货'],
  packed: ['delivering', '开始配送'],
  delivering: ['completed', '确认送达']
};
export const PURCHASE_NEXT = { pending: ['quoted', '填写报价'], quoted: ['processing', '开始代买'] };

export const CATEGORIES = { fresh: '新鲜食材', household: '居家日用', dairy: '牛奶乳品' };
export const TONES = ['peach', 'cocoa', 'butter', 'sage', 'rose', 'mango', 'lemon', 'oat'];
export const PRESET_IMAGES = {
  '/images/products/eggs.jpg': '鸡蛋',
  '/images/products/tissue.jpg': '卫生纸',
  '/images/products/milk.jpg': '牛奶'
};

export const SHARE_STATUS = { pending: '待审核', approved: '已公开', rejected: '未通过', off: '已下架', taken: '已转出' };
export const SHARE_CONDITION = { new: '几乎全新', like: '九成新', used: '七成新', worn: '有使用痕迹' };
export const SHARE_MODE = { sale: '二手转让', giveaway: '免费分享' };
export const FORUM_BOARDS = { chat: '邻里闲聊', help: '互帮互助', lost: '失物招领', notice: '社区公告' };
export const CONTACT = { knock: '请敲门', call: '到达后打电话', no_knock: '不要敲门' };
export const PACKAGE_SIZE = { small: '小件', large: '大件' };

export const DEFAULT_SETTINGS = {
  ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00',
  deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0,
  ownerOpenid: '', ownerWechat: '',
  expressEnabled: false, expressFollowShop: false, expressBaseFeeCents: 300,
  expressExtraFeeCents: 100, expressLargeFeeCents: 100,
  expressStart: '09:00', expressEnd: '21:00', expressStations: [],
  purchaseEnabled: false, purchaseFeeCents: 500, purchaseStart: '09:00', purchaseEnd: '21:00',
  purchaseStore: '京东便利店', secondhandEnabled: false
};

export const yuan = value => `¥${((Number(value) || 0) / 100).toFixed(2)}`;
export const toCents = value => {
  const n = Number(String(value || '').trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
};
export const centsToInput = value => ((Number(value) || 0) / 100).toFixed(2);

export function beijingClock(at) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(at || Date.now()));
}

export function serviceState(enabled, start, end, at) {
  if (!enabled) return { label: '未开启', tone: 'off' };
  const now = beijingClock(at);
  return now >= start && now < end ? { label: '营业中', tone: 'on' } : { label: '当前休息中', tone: 'wait' };
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
}

export function fromNow(value) {
  if (!value) return '—';
  const diff = Date.now() - Number(value);
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatTime(value);
}

export const orderKind = order => (order.orderType === 'express' ? 'express' : order.orderType === 'purchase' ? 'purchase' : 'goods');
export const KIND_TEXT = { goods: '便利铺现货', express: '快递代取', purchase: '便利店代买' };

export function nextAction(order) {
  if (orderKind(order) === 'purchase') return PURCHASE_NEXT[order.status] || NEXT_ACTION[order.status];
  return NEXT_ACTION[order.status];
}

export function canCancel(order) {
  return ['pending', 'quoted', 'processing', 'confirmed', 'packed'].includes(order.status);
}
