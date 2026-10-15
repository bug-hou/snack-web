import { useCallback, useEffect, useState } from 'react';

import { getApp, normalizeError } from './cloudbase';
import { SESSION_UID_KEY, storage } from './storage';

export type SessionSource = 'anonymous' | 'password' | 'restored' | 'none';

export type Session = {
  uid: string;
  source: SessionSource;
};

/* CloudBase JS SDK v2 用 app.auth()，v3 用 app.auth 属性，这里两种都兼容 */
function authClient(): any {
  const app = getApp() as any;
  return typeof app.auth === 'function' ? app.auth() : app.auth;
}

/** 读取当前登录用户标识；未登录或接口不可用时返回空串 */
async function currentUid(): Promise<string> {
  try {
    const auth = authClient();
    if (typeof auth.getLoginState === 'function') {
      const state = await auth.getLoginState();
      const uid: string = state?.user?.uid || state?.uid || '';
      if (uid) return uid;
    }
    return auth.currentUser?.uid || '';
  } catch {
    return '';
  }
}

function pickUid(response: any, fallback: string): string {
  return (
    response?.data?.uid ||
    response?.data?.user?.uid ||
    response?.user?.uid ||
    fallback ||
    ''
  );
}

export function useSession() {
  const [uid, setUid] = useState<string>(() => storage.getString(SESSION_UID_KEY) ?? '');
  const [source, setSource] = useState<SessionSource>(() =>
    storage.getString(SESSION_UID_KEY) ? 'restored' : 'none',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // 冷启动时尝试恢复 CloudBase 登录态
  useEffect(() => {
    let alive = true;
    currentUid().then((next) => {
      if (!alive || !next) return;
      setUid(next);
      setSource('restored');
      storage.set(SESSION_UID_KEY, next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback((next: string, nextSource: SessionSource) => {
    setUid(next);
    setSource(nextSource);
    storage.set(SESSION_UID_KEY, next);
  }, []);

  const signInAnonymously = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const response = await authClient().signInAnonymously();
      if (response?.error) {
        throw new Error(response.error.message || '匿名登录失败，请确认控制台已开启「匿名登录」');
      }
      const next = pickUid(response, await currentUid());
      if (!next) throw new Error('已登录但未取到用户标识，请检查 CloudBase 登录配置');
      remember(next, 'anonymous');
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setPending(false);
    }
  }, [remember]);

  const signInWithPassword = useCallback(
    async (username: string, password: string) => {
      setPending(true);
      setError('');
      try {
        const response = await authClient().signInWithPassword({ username, password });
        if (response?.error) {
          throw new Error(response.error.message || '登录失败，请检查账号与密码');
        }
        const next = pickUid(response, await currentUid());
        if (!next) throw new Error('已登录但未取到用户标识，请检查 CloudBase 登录配置');
        remember(next, 'password');
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
      const auth = authClient();
      if (typeof auth.signOut === 'function') await auth.signOut();
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      storage.delete(SESSION_UID_KEY);
      setUid('');
      setSource('none');
      setPending(false);
    }
  }, []);

  return {
    session: { uid, source } as Session,
    pending,
    error,
    signInAnonymously,
    signInWithPassword,
    signOut,
  };
}
