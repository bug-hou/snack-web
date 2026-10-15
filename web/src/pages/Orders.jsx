import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../cloud';
import { useToast, Chip, Empty, LoadingRow, Pager, Segmented, Icon, useConfirm } from '../ui';
import {
  ORDER_STATUS, STATUS_TONE, CONTACT, PACKAGE_SIZE, KIND_TEXT,
  orderKind, nextAction, canCancel, yuan, formatTime, fromNow
} from '../utils';

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'delivering', label: '配送中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
];
const TYPE_TABS = [
  { value: '', label: '全部类型' },
  { value: 'goods', label: '便利铺现货' },
  { value: 'express', label: '快递代取' },
  { value: 'purchase', label: '便利店代买' }
];

function OrderLines({ order }) {
  const kind = orderKind(order);
  if (kind === 'express') {
    return (order.packages || []).map((pkg, i) => (
      <div className="order-line" key={`p${i}`}>
        <span>包裹 {i + 1} · 取件码 {pkg.code} · 尾号 {pkg.phoneLast4} · {PACKAGE_SIZE[pkg.size] || '小件'}</span>
        <strong>{order.station || '—'}</strong>
      </div>
    ));
  }
  if (kind === 'purchase') {
    return (order.purchaseItems || []).map((item, i) => (
      <div className="order-line" key={`i${i}`}>
        <span>{item.name}{item.spec ? `（${item.spec}）` : ''} ×{item.quantity}</span>
        <strong>{order.allowSubstitute ? '可同类替换' : '不接受替换'}</strong>
      </div>
    ));
  }
  return (order.items || []).map((item, i) => (
    <div className="order-line" key={item.id || i}>
      <span>{item.name}{item.spec ? ` · ${item.spec}` : ''} ×{item.quantity}</span>
      <strong>{yuan(item.subtotalCents)}</strong>
    </div>
  ));
}

function OrderSums({ order }) {
  const kind = orderKind(order);
  if (kind === 'express') {
    return <>
      <div className="order-sum-row"><span>代取跑腿费</span><span className="num">{yuan(order.serviceFeeCents)}</span></div>
      <div className="order-sum-row total"><span>合计</span><span>{yuan(order.totalCents)}</span></div>
    </>;
  }
  if (kind === 'purchase') {
    return <>
      <div className="order-sum-row"><span>商品报价</span><span className="num">{yuan(order.quoteCents)}</span></div>
      <div className="order-sum-row"><span>代买跑腿费</span><span className="num">{yuan(order.serviceFeeCents)}</span></div>
      <div className="order-sum-row total"><span>合计</span><span>{yuan(order.totalCents)}</span></div>
    </>;
  }
  return <>
    <div className="order-sum-row"><span>商品小计</span><span className="num">{yuan(order.subtotalCents ?? order.totalCents)}</span></div>
    <div className="order-sum-row"><span>配送费</span><span className="num">{yuan(order.deliveryFeeCents)}</span></div>
    <div className="order-sum-row total"><span>合计</span><span>{yuan(order.totalCents)}</span></div>
  </>;
}

export default function Orders({ onChanged, registerRefresh }) {
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [quote, setQuote] = useState({});
  const filterRef = useRef({ status: '', type: '', page: 1 });
  filterRef.current = { status, type, page };

  const load = useCallback(async (nextPage = 1, nextStatus = filterRef.current.status, nextType = filterRef.current.type) => {
    setLoading(true);
    try {
      const data = await invoke('getOrders', { page: nextPage, status: nextStatus, type: nextType });
      setList(data.list || []);
      setPage(data.page || nextPage);
      setHasMore(!!data.hasMore);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => {
    if (typeof registerRefresh === 'function') registerRefresh(() => load(filterRef.current.page));
  }, [registerRefresh, load]);

  const changeFilter = (nextStatus, nextType) => {
    setStatus(nextStatus); setType(nextType);
    filterRef.current = { status: nextStatus, type: nextType, page: 1 };
    load(1, nextStatus, nextType);
  };

  async function advance(order, next) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke('changeStatus', { id: order._id, status: next });
      toast('订单状态已更新');
      await load(page, status, type);
      if (onChanged) onChanged();
    } catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }

  async function cancel(order) {
    if (busy) return;
    const ok = await ask({ title: '取消这笔订单？', message: `订单 #${order._id.slice(-8).toUpperCase()} 取消后将不再配送，请确认已与顾客沟通。`, confirmText: '取消订单' });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke('changeStatus', { id: order._id, status: 'cancelled' });
      toast('订单已取消');
      await load(page, status, type);
      if (onChanged) onChanged();
    } catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }

  async function submitQuote(order) {
    if (busy) return;
    const raw = quote[order._id];
    const cents = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) { toast('请填写有效的商品报价', 'error'); return; }
    setBusy(true);
    try {
      await invoke('quoteOrder', { id: order._id, quoteCents: cents });
      toast('报价已提交，等待顾客确认');
      setQuote(prev => ({ ...prev, [order._id]: '' }));
      await load(page, status, type);
      if (onChanged) onChanged();
    } catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Order Center</span>
          <h1>订单管理</h1>
          <p>接单、配货、配送一条龙，新订单会自动出现在这里。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => load(page, status, type)} disabled={loading}>
            <Icon name="shares" size={15} />刷新
          </button>
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={status} options={STATUS_TABS} onChange={v => changeFilter(v, type)} />
        <Segmented value={type} options={TYPE_TABS} onChange={v => changeFilter(status, v)} />
      </div>

      {loading ? <LoadingRow text="正在加载订单…" /> : list.length === 0
        ? <Empty title="没有符合条件的订单" text="换个筛选条件试试，或等待顾客下单。" />
        : (
          <div className="order-grid">
            {list.map(order => {
              const action = nextAction(order);
              const kind = orderKind(order);
              return (
                <article className="order" key={order._id}>
                  <div className="order-head">
                    <div className="order-id">
                      #{order._id.slice(-8).toUpperCase()}
                      <small>{formatTime(order.createdAt)} · {fromNow(order.createdAt)}</small>
                    </div>
                    <div className="order-head-right">
                      <Chip tone="blue">{KIND_TEXT[kind]}</Chip>
                      <Chip tone={STATUS_TONE[order.status] || 'grey'}>{ORDER_STATUS[order.status] || order.status}</Chip>
                    </div>
                  </div>

                  <div className="order-body">
                    <div className="order-items">
                      {kind === 'express' && order.station && <Chip tone="amber">{order.station}</Chip>}
                      <OrderLines order={order} />
                      <div className="order-sum"><OrderSums order={order} /></div>
                    </div>
                    <div className="order-meta">
                      <strong>{order.recipient || '未填写'}{order.phone ? `　${order.phone}` : ''}</strong>
                      <span>{order.address || '保利爱尚里'}</span>
                      <span>送达偏好：{CONTACT[order.contactPreference] || '请敲门'} · {order.delivery || '尽快送达'}</span>
                      {kind === 'purchase' && Number(order.budgetCents) > 0 && <span>顾客预算：{yuan(order.budgetCents)}</span>}
                      {order.note && <div className="note">备注：{order.note}</div>}
                    </div>
                  </div>

                  <div className="order-foot">
                    <small>货到付款 · 送达后线下结算</small>
                    <div className="order-actions">
                      {kind === 'purchase' && ['pending', 'quoted'].includes(order.status) && (
                        <>
                          <input
                            className="input quote-input" type="number" min="0" step="0.01"
                            placeholder="商品报价（元）"
                            value={quote[order._id] ?? ''}
                            onChange={e => setQuote({ ...quote, [order._id]: e.target.value })}
                          />
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => submitQuote(order)}>提交报价</button>
                        </>
                      )}
                      {action && !(kind === 'purchase' && order.status === 'pending') && (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => advance(order, action[0])}>
                          {action[1]}<Icon name="arrow" size={14} />
                        </button>
                      )}
                      {canCancel(order) && (
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => cancel(order)}>取消订单</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      <Pager page={page} hasMore={hasMore} busy={loading}
        onPrev={() => { const p = Math.max(1, page - 1); filterRef.current.page = p; load(p, status, type); }}
        onNext={() => { const p = page + 1; filterRef.current.page = p; load(p, status, type); }} />

      {confirmDialog}
    </div>
  );
}
