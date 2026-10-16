import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Card } from '../components/Bits';
import { navigate, redirect } from '../lib/router';
import { getSummary, clear } from '../lib/cart';
import { getProducts, loadProducts } from '../lib/catalog';
import { getAddresses, peekAddresses, peekContext, loadContext } from '../lib/shop';
import { invoke } from '../lib/cloud';
import { toast, confirm } from '../lib/ui';

const STEP_MS = 5 * 60 * 1000;
const MAX_DAYS = 7;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const pad = n => String(n).padStart(2, '0');
const toMinutes = clock => {
  const [h, m] = String(clock || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const moneyText = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);

function buildDays() {
  const now = new Date();
  const days = [];
  for (let i = 0; i <= MAX_DAYS; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? '今天' : i === 1 ? '明天' : `${day.getMonth() + 1}月${day.getDate()}日 周${WEEKDAYS[day.getDay()]}`;
    days.push({ day, label });
  }
  return days;
}

function buildSlots(start, end) {
  const slots = [];
  for (let m = start; m <= end; m += 5) slots.push(m);
  return slots;
}

export default function Checkout({ productId = '' }) {
  const [config, setConfig] = useState(() => peekContext());
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState(() => {
    const cached = peekAddresses();
    return cached ? cached.selected : null;
  });
  const [catalog, setCatalog] = useState(() => getProducts());
  const [loading, setLoading] = useState(() => !getProducts().length);
  const [loadError, setLoadError] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [slotIndex, setSlotIndex] = useState(-1);
  const requestId = useRef(null);

  const days = useMemo(buildDays, []);
  const window_ = useMemo(() => ({
    start: toMinutes(config && config.deliveryStart ? config.deliveryStart : '09:00'),
    end: toMinutes(config && config.deliveryEnd ? config.deliveryEnd : '22:00')
  }), [config]);
  const slots = useMemo(() => buildSlots(window_.start, window_.end), [window_]);

  const load = useCallback(async () => {
    setLoading(!getProducts().length);
    setLoadError('');
    try {
      const [, addressResult, nextConfig] = await Promise.all([loadProducts(), getAddresses(), loadContext()]);
      setCatalog(getProducts());
      setConfig(nextConfig);
      setAddress(addressResult.selected);
      setReady(true);
      setLoading(false);
    } catch (error) {
      setReady(false);
      setLoading(false);
      setLoadError('暂时无法确认商品信息，请稍后再试');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selection = useMemo(() => {
    if (!productId) return getSummary();
    const product = getProducts().find(item => item.id === productId);
    if (!product) return { items: [], count: 0, total: '0.00' };
    return { items: [{ ...product, quantity: 1, subtotal: product.price }], count: 1, total: product.price };
  }, [productId, catalog]);

  const feeCents = Number.isSafeInteger(config && config.deliveryFeeCents) ? config.deliveryFeeCents : 0;
  const minCents = Number.isSafeInteger(config && config.minOrderCents) ? config.minOrderCents : 0;
  const subtotalCents = Math.round(Number(selection.total) * 100);
  const payable = ((subtotalCents + feeCents) / 100).toFixed(2);
  const belowMinimum = subtotalCents < minCents;
  const open = ready && !!(config && config.isOpen);
  const canOrder = open && subtotalCents >= minCents && !!address;

  const deliveryAt = useMemo(() => {
    if (slotIndex < 0) return 0;
    const day = days[dayIndex];
    const minutes = slots[slotIndex];
    if (!day || minutes === undefined) return 0;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60).getTime();
  }, [dayIndex, slotIndex, days, slots]);

  const deliveryText = useMemo(() => {
    if (!deliveryAt) return '尽快送达';
    const dayLabel = dayIndex === 0 ? '今天' : dayIndex === 1 ? '明天' : `${days[dayIndex].getMonth() + 1}月${days[dayIndex].getDate()}日`;
    const minutes = slots[slotIndex];
    return `${dayLabel} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }, [deliveryAt, dayIndex, slotIndex, days, slots]);

  const shopNotice = config && config.ordersEnabled
    ? `营业 ${config.businessStart}—${config.businessEnd}，配送 ${config.deliveryStart}—${config.deliveryEnd}。仅在两个时段内接受需求登记。`
    : '小店暂未营业，当前无法登记需求。';

  async function submitOrder() {
    if (submitting) return;
    if (!address) { navigate('/address?from=checkout'); return; }
    if (!open) {
      await confirm({ title: '暂时无法登记', content: shopNotice, confirmText: '我知道了', showCancel: false });
      return;
    }
    if (belowMinimum) { toast(`商品满${moneyText(minCents)}元起送`); return; }
    if (deliveryAt && deliveryAt < Date.now()) {
      setSlotIndex(-1);
      toast('所选送达时间已过，请重新选择');
      return;
    }
    if (!selection.count || loadError) return;
    if (!requestId.current) {
      requestId.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    }
    setSubmitting(true);
    try {
      const order = await invoke('createOrder', {
        requestId: requestId.current,
        addressId: address.id,
        note: note.trim(),
        expectedTotalCents: Math.round(Number(payable) * 100),
        deliveryAt: deliveryAt || 0,
        items: selection.items.map(item => ({ id: item.id, quantity: item.quantity }))
      });
      requestId.current = null;
      if (!productId) clear();
      await confirm({
        title: '需求已登记',
        content: `参考合计 ¥${order.total}（含配送费 ¥${order.deliveryFee}）。店家会按登记内容线下与您确认，送达后当面结算，本页面不收款。`,
        confirmText: '查看我的需求',
        showCancel: false
      });
      redirect('/orders');
    } catch (error) {
      toast(error.message || '登记失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  const actionText = submitting ? '正在提交…'
    : !address ? '先添加收货地址'
      : !ready ? '正在确认…'
        : belowMinimum ? '未达到起送金额'
          : open ? '登记需求 · 线下对接' : '暂不接单';

  return (
    <div className="screen screen-padded checkout-page">
      <PageHeader title="确认需求" sub="送达后线下当面结算" />

      <Banner>这一步只是把您的需求登记给店家，不会产生在线订单，也不需要在线支付。商品、数量与送达时间以店家线下与您确认为准。</Banner>

      {loadError || (ready && !open) ? <div className="preview-warning">{loadError || shopNotice}</div> : null}

      <Card title={<><span className="form-index">01</span> 送达地址</>}>
        <button type="button" className="checkout-address" onClick={() => navigate('/address?from=checkout')}>
          {address ? (
            <>
              <span className="checkout-address-title">
                {address.building}栋 {address.room} <span>切换　›</span>
              </span>
              <span className="checkout-address-sub">{address.recipient}　{address.phone}</span>
              <span className="checkout-address-sub">
                {address.contactPreference === 'call' ? '到达后打电话' : address.contactPreference === 'no_knock' ? '不要敲门' : '请敲门'}
              </span>
            </>
          ) : <span className="checkout-address-title">＋ 添加收货地址　›</span>}
        </button>
      </Card>

      <Card title={<><span className="form-index">02</span> 配送偏好</>}>
        <div className="form-field delivery-selector">
          <span>期望送达</span>
          <span className="picker-value">{deliveryText}</span>
        </div>
        <div className="time-row">
          <select value={dayIndex} onChange={event => setDayIndex(Number(event.target.value))} aria-label="选择日期">
            {days.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
          <select value={slotIndex} onChange={event => setSlotIndex(Number(event.target.value))} aria-label="选择时间">
            <option value={-1}>尽快送达</option>
            {slots.map((minutes, index) => (
              <option key={minutes} value={index}>
                {pad(Math.floor(minutes / 60))}:{pad(minutes % 60)}
              </option>
            ))}
          </select>
        </div>
        <label className="field">
          <span className="field-label">备注</span>
          <input
            className="input"
            value={note}
            maxLength={100}
            placeholder="如有门禁等特殊说明，请写在这里"
            onChange={event => setNote(event.target.value)}
          />
        </label>
      </Card>

      <Card title={<><span className="form-index">03</span> 商品明细</>}>
        {loading ? <div className="checkout-item"><span>正在加载商品…</span></div> : null}
        {selection.items.map(item => (
          <div key={item.id} className="checkout-item">
            <span>{item.name} ×{item.quantity}</span>
            <span>¥{item.subtotal}</span>
          </div>
        ))}
        <div className="checkout-item"><span>商品参考小计</span><span>¥{selection.total}</span></div>
        <div className="checkout-item"><span>预计跑腿配送费</span><span>¥{moneyText(feeCents)}</span></div>
        <div className="checkout-total"><span>参考合计</span><span>¥{payable}</span></div>
        {belowMinimum && ready ? <div className="checkout-footnote">商品满 ¥{moneyText(minCents)} 起送，还差一点点</div> : null}
      </Card>

      <div className="checkout-footer dock">
        <div className="checkout-total-price">参考合计 <strong>¥{payable}</strong></div>
        <button
          type="button"
          className={`disabled-action ${canOrder ? 'enabled-action' : ''}`}
          onClick={submitOrder}
          disabled={submitting}
        >
          {actionText}
        </button>
      </div>
    </div>
  );
}
