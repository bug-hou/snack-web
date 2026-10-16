// 业务常量：与云函数版本逐项对齐，改动前请确认前端是否同步

export const STATUS = {
  pending: '待处理',
  quoted: '待确认报价',
  processing: '订单处理中',
  packed: '配货完成',
  delivering: '配送中',
  completed: '配送完成',
  cancelled: '已取消',
  confirmed: '订单处理中'
};

export const NEXT = {
  pending: ['quoted', 'processing', 'cancelled'],
  quoted: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['delivering', 'cancelled'],
  delivering: ['completed'],
  confirmed: ['packed', 'cancelled']
};

export const BUILDINGS = ['16', '17', '18'];
export const CONTACT_PREFERENCES = ['knock', 'call', 'no_knock'];
export const ADDRESS_LIMIT = 10;

export const ORDER_KINDS = ['express', 'purchase'];
export const EXPRESS_MAX_PACKAGES = 20;
export const PURCHASE_MAX_ITEMS = 10;
export const PACKAGE_SIZES = ['small', 'large'];

export const DELIVERY_STEP_MS = 5 * 60 * 1000;
export const DELIVERY_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export const SHARE_CONDITIONS = { new: '几乎全新', like: '九成新', used: '七成新', worn: '有使用痕迹' };
export const SHARE_MODES = { sale: '二手转让', giveaway: '免费分享' };
export const SHARE_STATUS = { pending: '待审核', approved: '已公开', rejected: '未通过', off: '已下架', taken: '已转出' };
export const SHARE_LIMIT = 30;
export const SHARE_MAX_STATIONS = 10;

export const FORUM_BOARDS = ['chat', 'help', 'lost', 'notice'];
export const FORUM_OWNER_BOARDS = ['notice'];
export const FORUM_BOARD_TEXT = { chat: '邻里闲聊', help: '互帮互助', lost: '失物招领', notice: '社区公告' };
export const FORUM_TITLE_MAX = 40;
export const FORUM_CONTENT_MAX = 1000;
export const FORUM_COMMENT_MAX = 200;
export const FORUM_IMAGE_MAX = 3;
export const FORUM_PAGE_SIZE = 15;
export const FORUM_DAILY_POSTS = 10;
export const FORUM_WINDOW_COMMENTS = 10;
export const FORUM_WINDOW_MS = 10 * 60 * 1000;
export const FORUM_LIKE_CAP = 500;

export const CATEGORIES = ['fresh', 'household', 'dairy'];
export const TONES = ['peach', 'cocoa', 'butter', 'sage', 'rose', 'mango', 'lemon', 'oat'];
export const LEGACY_PRODUCT_IMAGES = ['/images/products/eggs.jpg', '/images/products/tissue.jpg', '/images/products/milk.jpg'];

export const DEFAULT_SETTINGS = {
  ordersEnabled: true,
  businessStart: '09:00',
  businessEnd: '22:00',
  deliveryStart: '09:00',
  deliveryEnd: '22:00',
  deliveryFeeCents: 0,
  minOrderCents: 0,
  ownerWechat: '',
  // 社区服务默认全部在线，商家可在后台随时切成下线
  expressEnabled: true,
  expressFollowShop: false,
  expressBaseFeeCents: 300,
  expressExtraFeeCents: 100,
  expressLargeFeeCents: 100,
  expressStart: '09:00',
  expressEnd: '21:00',
  expressStations: ['菜鸟驿站', '丰巢快递柜'],
  purchaseEnabled: true,
  purchaseFeeCents: 500,
  purchaseStart: '09:00',
  purchaseEnd: '21:00',
  purchaseStore: '京东便利店',
  secondhandEnabled: true
};

export const USER_PAGE_SIZE = 20;
export const USER_SCAN_LIMIT = 2000;
export const ADMIN_PAGE_SIZE = 20;
