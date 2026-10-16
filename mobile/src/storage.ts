import { MMKV } from 'react-native-mmkv';

/** 本地持久化：登录态等少量关键数据，避免每次冷启动都重新登录 */
export const storage = new MMKV({ id: 'snack-mobile' });

export const SESSION_UID_KEY = 'auth.uid';
export const SESSION_TOKEN_KEY = 'auth.token';

/** 清空本地登录态（令牌过期、退出登录时调用） */
export function clearSessionStorage(): void {
  storage.delete(SESSION_UID_KEY);
  storage.delete(SESSION_TOKEN_KEY);
}
