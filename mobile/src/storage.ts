import { MMKV } from 'react-native-mmkv';

/** 本地持久化：登录态等少量关键数据，避免每次冷启动都重新登录 */
export const storage = new MMKV({ id: 'snack-mobile' });

export const SESSION_UID_KEY = 'cloudbase.uid';
