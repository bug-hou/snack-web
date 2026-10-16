export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

/** 列表/页面的加载、空态、错误提示，样式与小程序保持一致 */
export function Message({ children, onClick }) {
  if (!children) return null;
  return (
    <div className={`message-line ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  );
}

/* 空状态插画：用线条图形占位，避免页面只剩一行文字显得空 */
const ARTS = {
  box: (
    <>
      <rect x="3.5" y="7" width="17" height="13" rx="2.5" />
      <path d="M3.5 12.2h17M12 7v13" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H9.6L4.5 22v-4.6A7.5 7.5 0 0 1 11 4h2a7.5 7.5 0 0 1 7.5 7.5z" />
      <path d="M9 11h7M9 14h4" />
    </>
  ),
  bag: (
    <>
      <path d="M5.8 8h12.4l1 12H4.8l1-12z" />
      <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
    </>
  ),
  receipt: (
    <>
      <path d="M6.5 3h11v17l-2.75-1.8L12 20l-2.75-1.8L6.5 20V3z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  )
};

export function EmptyArt({ kind = 'box', size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ARTS[kind] || ARTS.box}
    </svg>
  );
}

export function EmptyState({ art, title, copy, action, kind = 'box' }) {
  return (
    <div className="empty-state">
      <div className="empty-art">{art || <EmptyArt kind={kind} />}</div>
      {title ? <div className="empty-heading">{title}</div> : null}
      {copy ? <div className="empty-copy">{copy}</div> : null}
      {action}
    </div>
  );
}

/* 骨架屏：加载中用占位块撑起版面，避免闪白与“页面很空” */
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`.trim()} style={style} />;
}

export function SkeletonList({ count = 3, kind = 'row' }) {
  return (
    <div className={kind === 'card' ? 'skeleton-cards' : 'skeleton-rows'}>
      {Array.from({ length: count }).map((_, index) => (
        <div className={kind === 'card' ? 'skeleton-card' : 'skeleton-row'} key={index}>
          {kind === 'card' ? (
            <>
              <Skeleton className="skeleton-shot" />
              <Skeleton className="skeleton-line" style={{ width: '72%' }} />
              <Skeleton className="skeleton-line" style={{ width: '46%' }} />
            </>
          ) : (
            <>
              <Skeleton className="skeleton-dot" />
              <div className="skeleton-lines">
                <Skeleton className="skeleton-line" style={{ width: '58%' }} />
                <Skeleton className="skeleton-line" style={{ width: '38%' }} />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Chip({ active = false, onClick, children, small = false }) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'chosen' : ''} ${small ? 'small' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function Card({ title, extra, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="card-head">
          <span className="card-title">{title}</span>
          {extra ? <span className="card-note">{extra}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Banner({ children, tone = 'grey' }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}
