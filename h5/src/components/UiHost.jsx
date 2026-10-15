import { useEffect, useState } from 'react';
import { subscribeUi } from '../lib/ui';

export default function UiHost() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  useEffect(() => subscribeUi(payload => {
    if (payload.type === 'toast') {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts(list => [...list, { id, message: payload.message }]);
      setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), payload.duration);
      return;
    }
    if (payload.type === 'confirm') setDialog({ ...payload });
  }), []);

  function settle(value) {
    if (!dialog) return;
    dialog.resolve(value);
    setDialog(null);
  }

  return (
    <>
      <div className="toast-layer" aria-live="polite">
        {toasts.map(item => <div key={item.id} className="toast">{item.message}</div>)}
      </div>
      {dialog && (
        <div className="modal-mask" onClick={() => settle(false)} role="presentation">
          <div className="modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-title">{dialog.title}</div>
            {dialog.content ? <div className="modal-content">{dialog.content}</div> : null}
            <div className="modal-actions">
              {dialog.showCancel ? (
                <button type="button" className="modal-btn ghost" onClick={() => settle(false)}>{dialog.cancelText}</button>
              ) : null}
              <button
                type="button"
                className={`modal-btn ${dialog.danger ? 'danger' : 'solid'}`}
                onClick={() => settle(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
