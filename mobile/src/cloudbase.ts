import cloudbase from '@cloudbase/js-sdk';
import adapter from '@cloudbase/adapter-rn';

import { cloudbaseConfig, configErrorMessage } from './config';

/**
 * CloudBase 客户端。
 *
 * RN 端没有 wx.cloud，必须走官方 RN 适配器（@cloudbase/adapter-rn）：
 * 适配器内部处理了 RN 下的持久化（react-native-mmkv）与网络请求。
 */
type CloudbaseSdk = typeof cloudbase & {
  useAdapters?: (adapter: unknown) => void;
};

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let app: CloudbaseApp | null = null;

export function getApp(): CloudbaseApp {
  if (app) return app;
  if (!cloudbaseConfig.env || !cloudbaseConfig.accessKey) {
    throw new Error(configErrorMessage());
  }
  const sdk = cloudbase as CloudbaseSdk;
  // 适配器必须在 init 之前注册，否则 SDK 识别不到 RN 运行环境
  if (typeof sdk.useAdapters === 'function') sdk.useAdapters(adapter);
  app = cloudbase.init({
    env: cloudbaseConfig.env,
    region: cloudbaseConfig.region,
    accessKey: cloudbaseConfig.accessKey,
  });
  return app;
}

export type CloudFunctionName = 'snackShop' | 'snackAdmin';

type CloudResult = { ok?: boolean; message?: string; data?: unknown } | null;

function safeParse(text: string): CloudResult {
  try {
    return JSON.parse(text) as CloudResult;
  } catch {
    return null;
  }
}

/**
 * 调用云函数。与小程序端 utils/snack-cloud.js、Web 端 web/src/cloud.js
 * 保持同一套协议：{ action, data } → { ok, message, data }
 */
export async function invoke<T>(
  name: CloudFunctionName,
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await getApp().callFunction({ name, data: { action, data }, parse: true });
  const raw = response.result;
  const result: CloudResult = typeof raw === 'string' ? safeParse(raw) : (raw as CloudResult);
  if (!result || result.ok !== true) {
    throw new Error((result && result.message) || '服务暂不可用，请稍后重试');
  }
  return result.data as T;
}

/** 统一翻译 CloudBase 抛出的原始错误，便于在 UI 上直接展示 */
export function normalizeError(error: unknown): string {
  const raw = (error as { message?: string; errMsg?: string } | null)?.message
    || (error as { errMsg?: string } | null)?.errMsg
    || '';
  if (!raw) return '网络请求失败，请稍后重试';
  if (/collection.*not\s*exist|db not exist/i.test(raw)) return '数据集合还没初始化，请先部署云函数并初始化数据';
  return raw;
}
