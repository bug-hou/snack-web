import { useEffect, useState } from 'react';

// 纯静态站点：用 hash 路由，刷新与直接分享链接都能落到正确页面
export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function navigate(path) {
  const next = `#${path}`;
  if (window.location.hash === next) return;
  window.location.hash = path;
}

export function redirect(path) {
  window.location.replace(`${window.location.pathname}${window.location.search}#${path}`);
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else redirect(fallback);
}

export function parsePath(path) {
  const [rawPath, rawQuery = ''] = path.split('?');
  const segments = rawPath.split('/').filter(Boolean);
  const query = {};
  rawQuery.split('&').filter(Boolean).forEach(pair => {
    const [key, value = ''] = pair.split('=');
    query[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return { segments, query };
}

export function useRoute() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    // 切换页面后回到顶部，模拟小程序打开新页面的行为
    window.scrollTo(0, 0);
  }, [path]);
  return path;
}
