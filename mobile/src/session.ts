import { useCallback, useState } from 'react';

import { currentUid, login, logout, normalizeError, register } from './client';

export type SessionSource = 'password' | 'registered' | 'restored' | 'none';

export type Session = {
  uid: string;
  source: SessionSource;
};

/**
 * 登录态。
 * 令牌与用户标识都存在 MMKV（同步读写），冷启动直接读取，无需异步恢复。
 * 云开发版本的「匿名登录」已移除，改为自建账号体系（登录 / 注册）。
 */
export function useSession() {
  const [uid, setUid] = useState<string>(() => currentUid());
  const [source, setSource] = useState<SessionSource>(() => (currentUid() ? 'restored' : 'none'));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const remember = useCallback((next: string, nextSource: SessionSource) => {
    setUid(next);
    setSource(nextSource);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setPending(true);
      setError('');
      try {
        const next = await login(username, password);
        remember(next, 'password');
      } catch (e) {
        setError(normalizeError(e));
      } finally {
        setPending(false);
      }
    },
    [remember],
  );

  const signUp = useCallback(
    async (username: string, password: string, nickName = '') => {
      setPending(true);
      setError('');
      try {
        const next = await register(username, password, nickName);
        remember(next, 'registered');
      } catch (e) {
        setError(normalizeError(e));
      } finally {
        setPending(false);
      }
    },
    [remember],
  );

  const signOut = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      logout();
    } finally {
      setUid('');
      setSource('none');
      setPending(false);
    }
  }, []);

  return {
    session: { uid, source } as Session,
    pending,
    error,
    signIn,
    signUp,
    signOut,
  };
}
