import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveImages } from './cloud';

/* ------------------------- 图标 ------------------------- */
const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></>,
  orders: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  products: <><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" /><path d="M3.3 7L12 12l8.7-5" /><path d="M12 22V12" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  shares: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  posts: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  close: <><path d="M18 6L6 18M6 6l12 12" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  up: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  down: <><path d="M12 5v14M19 12l-7 7-7-7" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M16 12h3v5h-3a2.5 2.5 0 0 1 0-5z" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>
};

export function Icon({ name, size = 16, className }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

/* ------------------------- 基础原子 ------------------------- */
export function Chip({ tone = '', children }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function Spinner() { return <span className="spinner" />; }

export function LoadingRow({ text = '正在加载…' }) {
  return <div className="loading-row"><Spinner />{text}</div>;
}

export function Empty({ title = '暂无数据', text, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text && <div className="small">{text}</div>}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'error', children, onClose }) {
  return (
    <div className={`alert ${tone}`} role="alert">
      <div className="grow">{children}</div>
      {onClose && <button className="x" onClick={onClose} aria-label="关闭"><Icon name="close" size={14} /></button>}
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Switch({ checked, onChange, title, hint }) {
  return (
    <label className="switch">
      <span className="switch-copy">
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch-box">
        <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function Pager({ page, hasMore, busy, onPrev, onNext }) {
  return (
    <div className="pager">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1 || busy} onClick={onPrev}>上一页</button>
      <span>第 {page} 页</span>
      <button className="btn btn-ghost btn-sm" disabled={!hasMore || busy} onClick={onNext}>下一页</button>
    </div>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(opt => (
        <button key={opt.value} className={value === opt.value ? 'on accent' : ''} onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = '搜索…' }) {
  return (
    <div className="search-box">
      <Icon name="search" size={15} />
      <input className="input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/* ------------------------- 弹层 ------------------------- */
export function Modal({ title, subtitle, onClose, footer, wide, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭"><Icon name="close" size={17} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = useCallback(options => new Promise(resolve => setState({ ...options, resolve })), []);
  const close = result => {
    if (!state) return;
    state.resolve(result);
    setState(null);
  };
  const dialog = state ? (
    <Modal
      title={state.title || '请确认'}
      subtitle={state.message}
      onClose={() => close(false)}
      footer={<>
        <button className="btn btn-ghost" onClick={() => close(false)}>取消</button>
        <button className={`btn ${state.danger === false ? 'btn-primary' : 'btn-danger'}`} onClick={() => close(true)}>
          {state.confirmText || '确定'}
        </button>
      </>}
    >
      {state.body || null}
    </Modal>
  ) : null;
  return [ask, dialog];
}

/* ------------------------- Toast ------------------------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems(list => [...list, { id, text, tone }]);
    setTimeout(() => setItems(list => list.filter(item => item.id !== id)), 3200);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack">
        {items.map(item => (
          <div key={item.id} className={`toast ${item.tone}`}>{item.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------- 云存储图片 ------------------------- */
export function useImageMap(sources) {
  const list = useMemo(() => [...new Set((sources || []).filter(Boolean))], [(sources || []).join('|')]);
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    if (!list.length) { setMap({}); return undefined; }
    resolveImages(list).then(next => { if (alive) setMap(next); }).catch(() => {});
    return () => { alive = false; };
  }, [list.join('|')]);
  return map;
}

export function SmartImage({ src, alt = '', className, fallback = null }) {
  const map = useImageMap([src]);
  const url = map[src];
  return url ? <img className={className} src={url} alt={alt} /> : <>{fallback}</>;
}

export function ShotList({ images = [] }) {
  const map = useImageMap(images);
  if (!images.length) return <span className="small muted">未上传图片</span>;
  return (
    <div className="shot-list">
      {images.map((src, i) => (
        <div className="shot" key={`${src}-${i}`}>
          {map[src] ? <img src={map[src]} alt={`图片 ${i + 1}`} onClick={() => window.open(map[src], '_blank')} /> : <span>加载中</span>}
        </div>
      ))}
    </div>
  );
}
