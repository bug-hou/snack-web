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

export function EmptyState({ art, title, copy, action }) {
  return (
    <div className="empty-state">
      {art ? <div className="empty-art">{art}</div> : <div className="empty-art"><span className="empty-pack">SOON</span></div>}
      {title ? <div className="empty-heading">{title}</div> : null}
      {copy ? <div className="empty-copy">{copy}</div> : null}
      {action}
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
