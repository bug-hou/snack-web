import { AppError } from '../core/errors.js';
import { config } from '../config.js';

/**
 * 内容安全：替代云函数里的 wx msgSecCheck。
 * - 未配置腾讯云密钥时，只走内置词库，保证服务不依赖外部接口也能运行；
 * - 配置了 TMS_ENABLED=true 且密钥齐全时，额外调用腾讯云文本内容安全。
 * 与云函数一致：外部检测不可用时记录日志并放行，不阻断正常邻里交流。
 */

// 内置词库：命中即拒绝。请按社区实际情况补充。
const BLOCK_WORDS = [
  '微信',
  '加我',
  '私聊',
  '代刷',
  '刷单',
  '兼职日结',
  '贷款',
  '办证',
  '发票'
];

function hitLocal(content) {
  const text = String(content || '').toLowerCase();
  const found = BLOCK_WORDS.find((word) => text.includes(word.toLowerCase()));
  return found || '';
}

async function tmsCheck(content) {
  // 按需接入：使用腾讯云文本内容安全 TextModeration
  // 官方文档 https://cloud.tencent.com/document/product/1129
  // 这里刻意保持最小依赖，未安装 SDK 时直接跳过。
  const { secretId, secretKey, region } = config.tms;
  if (!secretId || !secretKey) return null;
  try {
    const { tms } = await import('tencentcloud-sdk-nodejs-tms');
    const client = new tms.v20200713.Client({
      credential: { secretId, secretKey },
      region,
      profile: { httpProfile: { endpoint: 'tms.tencentcloudapi.com' } }
    });
    const result = await client.TextModeration({ Content: Buffer.from(content).toString('base64') });
    return result && result.Suggestion ? result.Suggestion : null; // Pass / Review / Block
  } catch (error) {
    console.warn('[security] tms unavailable', error && error.message);
    return null;
  }
}

/**
 * 检测用户发布内容。命中即抛出业务错误。
 * @param {string} content 待检测文本
 */
export async function assertClean(content) {
  const text = String(content || '').trim();
  if (!text) return;

  const word = hitLocal(text);
  if (word) throw new AppError('内容可能包含违规信息，请修改后再发布');

  if (config.tms.enabled) {
    const suggestion = await tmsCheck(text);
    if (suggestion && suggestion !== 'Pass') {
      throw new AppError('内容可能包含违规信息，请修改后再发布');
    }
  }
}
