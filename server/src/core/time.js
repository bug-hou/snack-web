// 全部时间口径统一为北京时间（UTC+8），与云函数版本保持一致。
// 服务器时区可能是 UTC，所以不能用本地时间直接取。

const TZ = 'Asia/Shanghai';
const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const stampFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 当前北京时间 HH:mm */
export function clockNow() {
  return clockFormatter.format(new Date());
}

/** 时间戳 → { date: 'MM-DD', clock: 'HH:mm' } */
export function formatBeijing(ms) {
  const parts = stampFormatter.formatToParts(new Date(ms));
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  return { date: `${get('month')}-${get('day')}`, clock: `${get('hour')}:${get('minute')}` };
}

/** 北京时间当天 00:00 的时间戳，用于「今日订单」统计 */
export function todayStartMs() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return start - 8 * 60 * 60 * 1000;
}
