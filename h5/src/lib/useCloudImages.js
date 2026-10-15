import { useEffect, useState } from 'react';
import { resolveImages } from './cloud';

/**
 * 小程序里 cloud:// 地址可直接渲染，网页必须先换临时链接。
 * 传入 fileID 数组，返回 { fileID: 可访问地址 }。
 */
export function useCloudImages(sources) {
  const list = (sources || []).filter(src => typeof src === 'string' && src);
  const key = list.join('|');
  const [map, setMap] = useState({});

  useEffect(() => {
    if (!key) { setMap({}); return undefined; }
    let alive = true;
    resolveImages(key.split('|')).then(next => { if (alive) setMap(next); });
    return () => { alive = false; };
  }, [key]);

  return src => (src && String(src).startsWith('cloud://') ? (map[src] || '') : (src || ''));
}
