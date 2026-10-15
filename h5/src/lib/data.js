/* 与小程序 utils/ 保持一致的分类、文案与本地解析逻辑 */

export const categories = [
  { id: 'all', name: '全部' },
  { id: 'fresh', name: '新鲜食材' },
  { id: 'household', name: '居家日用' },
  { id: 'dairy', name: '牛奶乳品' }
];

export const services = [
  {
    id: 'express', title: '快递代取', shortTitle: '快递代取',
    subtitle: '少跑一趟，轻松到家', icon: 'package', label: '帮我取',
    description: '忙着上班，或不想下楼？把取件这件小事交给社区服务。',
    steps: [
      { title: '填写取件信息', description: '选择快递站点，填写取件码与包裹数量。' },
      { title: '确认费用与时间', description: '确认包裹大小、代取费用和送达安排后再登记需求。' },
      { title: '送到约定地点', description: '按约定送达，处理进度在服务订单中查看。' }
    ],
    rules: [
      { title: '费用与范围', description: '代取收费、覆盖站点及服务时间尚未确定，正式开放前会明确展示。' },
      { title: '保护取件信息', description: '不要在公开区域填写取件码、手机号或完整门牌号；服务开通后仅向授权处理者提供。' },
      { title: '特殊包裹先确认', description: '大件、易碎、生鲜及需要本人签收的包裹，需先确认是否可以代取。' }
    ]
  },
  {
    id: 'purchase', title: '京东便利店代买', shortTitle: '便利店代买',
    subtitle: '日常所需，顺路带回', icon: 'bag', label: '帮我买',
    description: '饮料、零食、日用品，把想买的列成清单，少一趟来回。',
    steps: [
      { title: '列出代买清单', description: '写清商品、规格和数量，选择是否接受同类替换。' },
      { title: '确认价格与服务费', description: '商品金额与代买服务费分别确认，不在缺货时擅自替换。' },
      { title: '购入并送达', description: '按确认清单购买，保留购买凭证，送至约定地点。' }
    ],
    rules: [
      { title: '非京东官方服务', description: '本项目是社区代买服务，不是京东官方小程序；尚未接入京东商品或订单系统。' },
      { title: '门店与价格', description: '合作门店、代买范围及服务费尚待确认；商品库存与售价以实际门店为准。' },
      { title: '现货与代买分开', description: '首页“便利铺商品信息”属于原有小店商品展示，不是京东便利店实时商品目录。' }
    ]
  },
  {
    id: 'secondhand', title: '二手物品分享', shortTitle: '二手物品分享',
    subtitle: '闲置流转，好物接力', icon: 'repeat', label: '邻里分享',
    description: '让用不上的好物找到新主人。二手转让，也可以免费送给邻居。',
    steps: [
      { title: '拍照介绍物品', description: '使用实物照片，写清成色、使用情况及已知瑕疵。' },
      { title: '选择分享方式', description: '二手转让或免费分享，价格与交接方式清楚标注。' },
      { title: '约好地点交接', description: '确认物品状态，在小区公共区域见面交接。' }
    ],
    rules: [
      { title: '真实描述', description: '仅发布本人有权处置的物品，说明瑕疵，不使用误导性图片和描述。' },
      { title: '保护邻里隐私', description: '物品介绍和图片中不要公开手机号、取件码或完整门牌号。' },
      { title: '安全交接', description: '建议白天在公共区域交接并当面检查；不提供资金托管或平台交易担保。' }
    ]
  }
];

export const BOARDS = [
  { id: 'all', name: '全部' },
  { id: 'chat', name: '邻里闲聊' },
  { id: 'help', name: '互助求助' },
  { id: 'lost', name: '失物招领' },
  { id: 'notice', name: '社区公告' }
];
export const POST_BOARDS = BOARDS.filter(board => board.id !== 'all');

const BOARD_NAMES = BOARDS.reduce((map, board) => { map[board.id] = board.name; return map; }, {});
export function boardName(id) { return BOARD_NAMES[id] || '邻里闲聊'; }

export const CONTACT_TEXT = { knock: '送达请敲门', call: '送达先打电话', no_knock: '送达不要敲门' };
export const CONTACT_LABELS = { knock: '请敲门', call: '到达后打电话', no_knock: '不要敲门' };
export const PACKAGE_SIZES = [
  { value: 'small', label: '小件', hint: '鞋服小物' },
  { value: 'large', label: '大件', hint: '整箱重物' }
];
export const CONDITIONS = [
  { value: 'new', label: '几乎全新' },
  { value: 'like', label: '九成新' },
  { value: 'used', label: '七成新' },
  { value: 'worn', label: '有使用痕迹' }
];
export const MODES = [
  { value: 'sale', label: '二手转让' },
  { value: 'giveaway', label: '免费分享' }
];
export const BUILDINGS = ['16', '17', '18'];
export const PREFERENCES = [
  { value: 'knock', label: '请敲门' },
  { value: 'call', label: '到达打电话' },
  { value: 'no_knock', label: '不要敲门' }
];
export const QUICK_NOTES = ['放门口即可', '到达前打电话', '家里有人，直接敲门', '先放驿站，我自取'];
export const SMS_SAMPLE = '【菜鸟驿站】请凭取件码 8-1-2345 到菜鸟驿站（16栋架空层）领取包裹，手机号尾号 6789。';
export const MAX_PACKAGES = 20;

export const money = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);
export const safeCents = value => (Number.isSafeInteger(value) ? value : 0);

export function expressFee(config, count, largeCount) {
  return safeCents(config.baseFeeCents)
    + safeCents(config.extraFeeCents) * Math.max(count - 1, 0)
    + safeCents(config.largeFeeCents) * largeCount;
}

export function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

// 统一按北京时间格式化，避免不同浏览器时区输出不一致
export function formatTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function excerpt(text, max = 80) {
  const flat = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function serviceStatus(config, id) {
  if (id === 'secondhand') {
    const enabled = !!(config && config.secondhand && config.secondhand.enabled);
    return enabled ? { text: '已开放', tone: 'on' } : { text: '未开放', tone: 'off' };
  }
  const service = config && config[id];
  if (!service || !service.configured) return { text: '未开放', tone: 'off' };
  return service.enabled ? { text: '营业中', tone: 'on' } : { text: '休息中', tone: 'wait' };
}

export function decorateServices(config) {
  return services.map(item => ({ ...item, ...serviceStatus(config, item.id) }));
}

/* ---------- 取件短信解析：全部为本地正则处理，不上传任何内容 ---------- */

const CODE_WORDS = '(?:取件码|取货码|提取码|取件号|提取号|取件密码|取件验证码|验证码)';
const TAIL_WORDS = '(?:手机(?:号)?(?:码)?尾号|手机号后四位|手机后四位|手机末四位|手机尾号|尾号|后四位|末四位)';
const STATION_WORDS = '(菜鸟驿站|菜鸟|丰巢快递柜|丰巢|快递柜|兔喜|妈妈驿站|熊猫快收|近邻宝|驿站|快递超市|收发室)';
const BIG_WORDS = '(?:大件|超大件|重货|大件包裹|家电|冰箱|洗衣机|家具|整箱|箱装)';

function normalize(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/[，、]/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\u00A0/g, ' ');
}

function splitSegments(text) {
  const marker = new RegExp(CODE_WORDS, 'g');
  const hits = [];
  let match = marker.exec(text);
  while (match) { hits.push(match.index); match = marker.exec(text); }
  if (hits.length <= 1) return [text];
  return hits.map((start, index) => text.slice(index === 0 ? 0 : start, index + 1 < hits.length ? hits[index + 1] : text.length));
}

function scanNumbers(segment) {
  const source = segment.replace(/1[3-9]\d{9}/g, '·');
  const out = [];
  const pattern = /\d{4,8}/g;
  let match = pattern.exec(source);
  while (match) {
    const before = source.charAt(match.index - 1);
    const after = source.charAt(match.index + match[0].length);
    if (!/\d/.test(before) && !/\d/.test(after)) out.push(match[0]);
    match = pattern.exec(source);
  }
  return out;
}

function pickCode(segment) {
  const labelled = new RegExp(`${CODE_WORDS}\\s*(?:是|为)?\\s*[:]?\\s*([0-9A-Za-z][0-9A-Za-z\\-]{2,31})`).exec(segment);
  if (labelled) return labelled[1];
  const dashed = /([0-9A-Za-z]+(?:-[0-9A-Za-z]+){1,5})/.exec(segment);
  if (dashed) return dashed[1];
  return scanNumbers(segment)[0] || '';
}

function pickTail(segment) {
  const labelled = new RegExp(`${TAIL_WORDS}\\s*(?:是|为)?\\s*[:]?\\s*(\\d{3,4})`).exec(segment);
  if (labelled) return labelled[1].slice(-4);
  const masked = /(?:1\d{2})?[\*×xX·．.\s]{2,6}(\d{4})/.exec(segment);
  if (masked) return masked[1];
  const mobile = /1[3-9]\d{9}/.exec(segment);
  if (mobile) return mobile[0].slice(-4);
  return '';
}

function pickStation(segment, stations) {
  const configured = stations.find(item => item.key && segment.indexOf(item.key) >= 0);
  if (configured) return configured.name;
  const keyword = new RegExp(STATION_WORDS).exec(segment);
  if (!keyword) return '';
  const building = /(\d{1,3}\s*栋)/.exec(segment);
  return keyword[1] + (building ? `（${building[1].replace(/\s/g, '')}）` : '');
}

function pickSize(segment) {
  return new RegExp(BIG_WORDS).test(segment) ? 'large' : 'small';
}

export function parsePickupText(text, stations) {
  const source = normalize(text);
  const list = (Array.isArray(stations) ? stations : [])
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => ({ name: item.trim(), key: normalize(item) }));
  if (!source.trim()) return { packages: [], warnings: ['请先粘贴短信内容'] };

  const segments = splitSegments(source);
  const globalTail = pickTail(source);
  const globalStation = pickStation(source, list);
  const seen = new Set();
  const packages = [];

  segments.forEach(segment => {
    const code = pickCode(segment);
    if (!code) return;
    const key = `${code.toUpperCase()}|${pickTail(segment) || globalTail}`;
    if (seen.has(key)) return;
    seen.add(key);
    packages.push({
      code,
      phoneLast4: pickTail(segment) || globalTail,
      size: pickSize(segment),
      station: pickStation(segment, list) || globalStation
    });
  });

  if (!packages.length) return { packages: [], warnings: ['没有识别出取件码，可以直接手动填写，或只粘贴包含取件码的那几句'] };

  const warnings = [];
  if (!packages[0].phoneLast4) warnings.push('没找到手机尾号，已留空，请补填 4 位数字');
  if (!packages[0].station) warnings.push('没找到快递站点，请在上方手动选择');
  return { packages, warnings };
}
