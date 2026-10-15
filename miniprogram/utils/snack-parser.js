// 从快递短信 / 复制的任意文本中识别取件信息，支持一次识别多个包裹。
// 全部为本地正则处理，不上传任何内容。

const CODE_WORDS = '(?:取件码|取货码|提取码|取件号|提取号|取件密码|取件验证码|验证码)';
const TAIL_WORDS = '(?:手机(?:号)?(?:码)?尾号|手机号后四位|手机后四位|手机末四位|手机尾号|尾号|后四位|末四位)';
const STATION_WORDS = '(菜鸟驿站|菜鸟|丰巢快递柜|丰巢|快递柜|兔喜|妈妈驿站|熊猫快收|近邻宝|驿站|快递超市|收发室)';
const BIG_WORDS = '(?:大件|超大件|重货|大件包裹|家电|冰箱|洗衣机|家具|整箱|箱装)';

const re = (source, flags) => new RegExp(source, flags);

function normalize(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/[，、]/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\u00A0/g, ' ');
}

// 按取件码关键词把整段文本切成若干段，每段对应一个包裹
function splitSegments(text) {
  const marker = re(CODE_WORDS, 'g');
  const hits = [];
  let match = marker.exec(text);
  while (match) { hits.push(match.index); match = marker.exec(text); }
  if (hits.length <= 1) return [text];
  // 第一段保留取件码之前的上下文（站点、姓名常写在开头）
  return hits.map((start, index) => text.slice(index === 0 ? 0 : start, index + 1 < hits.length ? hits[index + 1] : text.length));
}

// 取出文本中独立成段的 4-8 位数字（先剔除 11 位手机号，避免把手机号当取件码）
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
  const labelled = re(`${CODE_WORDS}\\s*(?:是|为)?\\s*[:]?\\s*([0-9A-Za-z][0-9A-Za-z\\-]{2,31})`).exec(segment);
  if (labelled) return labelled[1];
  const dashed = /([0-9A-Za-z]+(?:-[0-9A-Za-z]+){1,5})/.exec(segment);
  if (dashed) return dashed[1];
  return scanNumbers(segment)[0] || '';
}

function pickTail(segment) {
  const labelled = re(`${TAIL_WORDS}\\s*(?:是|为)?\\s*[:]?\\s*(\\d{3,4})`).exec(segment);
  if (labelled) return labelled[1].slice(-4);
  const masked = /(?:1\d{2})?[\*×xX·．.\s]{2,6}(\d{4})/.exec(segment);
  if (masked) return masked[1];
  const mobile = /1[3-9]\d{9}/.exec(segment);
  if (mobile) return mobile[0].slice(-4);
  return '';
}

// stations 形如 [{ name, key }]，key 为归一化后的名称，用于模糊比对；返回原始名称
function pickStation(segment, stations) {
  const configured = stations.find(item => item.key && segment.indexOf(item.key) >= 0);
  if (configured) return configured.name;
  const keyword = re(STATION_WORDS).exec(segment);
  if (!keyword) return '';
  const building = /(\d{1,3}\s*栋)/.exec(segment);
  return keyword[1] + (building ? `（${building[1].replace(/\s/g, '')}）` : '');
}

function pickSize(segment) {
  return re(BIG_WORDS).test(segment) ? 'large' : 'small';
}

/**
 * 解析一段文本（快递短信、备忘录、复制的取件通知）。
 * @param {string} text 原始文本
 * @param {string[]} stations 商家已配置的快递站点，用于优先匹配
 * @returns {{ packages: Array, warnings: string[] }}
 */
function parsePickupText(text, stations) {
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

module.exports = { parsePickupText };
