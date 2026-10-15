import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavBar } from '../components/Layout';
import { Banner, EmptyState, Spinner } from '../components/Bits';
import { redirect } from '../lib/router';
import { invoke } from '../lib/cloud';
import { getProducts, loadProducts } from '../lib/catalog';
import { peekContext, loadContext } from '../lib/shop';
import { confirm, toast } from '../lib/ui';
import { CONTACT_LABELS, formatTime } from '../lib/data';

const TABS = [
  { id: 'all', name: '全部' },
  { id: 'pending', name: '待处理' },
  { id: 'processing', name: '处理中' },
  { id: 'packed', name: '已配货' },
  { id: 'delivering', name: '配送中' },
  { id: 'completed', name: '已完成' }
];
const PROGRESS = { pending: 0, quoted: 0, processing: 1, confirmed: 1, packed: 2, delivering: 3, completed: 4, cancelled: -1 };
const STEPS = ['已登记', '处理中', '已备货', '送达中', '已完成'];
const SERVICE_SIZE = { small: '小件', large: '大件' };
const FINISHED = ['completed', 'cancelled'];
const POLL_ACTIVE_MS = 8000;
const POLL_IDLE_MS = 30000;

function serviceView(order) {
  const orderType = order.orderType === 'express' || order.orderType === 'purchase' ? order.orderType : 'goods';
  const fallback = {
    orderType: 'goods', kindText: '口袋便利铺', summaryText: '', serviceLines: [],
    feeLabel: '上门配送费', feeText: `¥${order.deliveryFee || '0.00'}`, quoteText: '', canConfirmQuote: false
  };
  if (orderType === 'express') {
    const packages = order.packages || [];
    return {
      ...fallback,
      orderType,
      kindText: '快递代取',
      summaryText: `${order.station || '快递站点'} · ${packages.length}个包裹`,
      serviceLines: packages.map((pkg, index) => ({
        label: `包裹${index + 1}`,
        value: `取件码 ${pkg.code} · 尾号 ${pkg.phoneLast4} · ${SERVICE_SIZE[pkg.size] || '小件'}`
      })),
      feeLabel: '代取跑腿费',
      feeText: `¥${order.serviceFee || '0.00'}`
    };
  }
  if (orderType === 'purchase') {
    const items = order.purchaseItems || [];
    return {
      ...fallback,
      orderType,
      kindText: '便利店代买',
      summaryText: `${order.store || '京东便利店'} · ${items.length}项商品`,
      serviceLines: items.map(item => ({ label: item.name, value: `×${item.quantity}${item.spec ? ` · ${item.spec}` : ''}` }))
        .concat([{ label: '缺货替换', value: order.allowSubstitute ? '允许同类替换' : '不接受替换' }]),
      feeLabel: '代买跑腿费',
      feeText: `¥${order.serviceFee || '0.00'}`,
      quoteText: order.status === 'quoted'
        ? `店主报价商品 ¥${order.quote || '0.00'}，确认后开始代买`
        : (Number(order.quoteCents) > 0 ? `商品报价 ¥${order.quote || '0.00'}` : ''),
      canConfirmQuote: order.status === 'quoted'
    };
  }
  return fallback;
}

function toViewOrder(order) {
  const items = order.items || [];
  const count = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const lines = items.map(item => ({
    ...item,
    subtotal: ((Number.isSafeInteger(item.subtotalCents) ? item.subtotalCents : 0) / 100).toFixed(2)
  }));
  const thumbs = lines.slice(0, 3).map(line => {
    const product = getProducts().find(p => p.id === line.id);
    return {
      id: line.id,
      name: line.name,
      initials: (line.name || '').slice(0, 2),
      image: product ? product.image : '',
      tone: product ? product.tone : 'peach'
    };
  });
  const service = serviceView(order);
  return {
    orderType: service.orderType,
    kindText: service.kindText,
    summaryText: service.orderType === 'goods' ? '' : service.summaryText,
    serviceLines: service.serviceLines,
    feeLabel: service.feeLabel,
    feeText: service.feeText,
    quoteText: service.quoteText,
    canConfirmQuote: service.canConfirmQuote,
    id: order.id,
    status: order.status,
    statusText: order.statusText,
    deliveryText: `${formatTime(order.createdAt)} 登记 · ${order.delivery || '尽快送达'}`,
    delivery: order.delivery || '尽快送达',
    recipient: order.recipient,
    phone: order.phone,
    address: order.address,
    contactText: CONTACT_LABELS[order.contactPreference] || '请敲门',
    note: order.note || '',
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    lines,
    thumbs,
    count,
    linesText: lines.map(line => `${line.name} ×${line.quantity}`).join('、'),
    moreCount: Math.max(0, items.length - 3),
    progress: PROGRESS[order.status],
    stepText: order.status === 'quoted' ? '待确认报价' : PROGRESS[order.status] >= 0 ? STEPS[PROGRESS[order.status]] : '订单已取消',
    canCancel: order.status === 'pending',
    canDelete: FINISHED.includes(order.status)
  };
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerWechat, setOwnerWechat] = useState(() => (peekContext() || {}).ownerWechat || '');
  const [expandedId, setExpandedId] = useState('');
  const fetching = useRef(false);

  const loadOrders = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (fetching.current) return;
    fetching.current = true;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const context = await loadContext();
      if ((context.ownerWechat || '') !== ownerWechat) setOwnerWechat(context.ownerWechat || '');
      await loadProducts().catch(() => {});
      const list = await invoke('listOrders', {});
      const next = list.map(toViewOrder);
      setOrders(next);
      setExpandedId(current => (current && next.some(order => order.id === current) ? current : ''));
      setLoading(false);
      setError('');
    } catch (e) {
      if (!silent) {
        setLoading(false);
        setError('订单暂时无法加载，请重试。');
        setOrders([]);
      }
    } finally {
      fetching.current = false;
    }
  }, [ownerWechat]);

  useEffect(() => { loadOrders(); }, []);

  useEffect(() => {
    const active = orders.some(order => !FINISHED.includes(order.status));
    const timer = setTimeout(() => loadOrders({ silent: true }), active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => clearTimeout(timer);
  }, [orders, loadOrders]);

  const filtered = useMemo(() => (
    activeTab === 'all'
      ? orders
      : orders.filter(order => order.status === activeTab || (activeTab === 'processing' && order.status === 'confirmed'))
  ), [orders, activeTab]);

  async function cancel(order) {
    const ok = await confirm({
      title: '确认取消登记',
      content: '取消后无法恢复，需要重新登记。',
      confirmText: '取消订单',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('changeStatus', { id: order.id, status: 'cancelled' });
      toast('已取消登记');
    } catch (e) {
      toast(e.message || '取消失败');
    }
    loadOrders({ silent: true });
  }

  async function remove(order) {
    const ok = await confirm({
      title: '删除订单',
      content: '删除后将不再显示这条订单记录，确定删除吗？',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('deleteOrder', { id: order.id });
      toast('订单已删除');
    } catch (e) {
      toast(e.message || '删除失败');
    }
    loadOrders({ silent: true });
  }

  async function confirmQuote(order) {
    const ok = await confirm({
      title: '确认报价',
      content: '确认后将按报价代买，送达后线下付款。',
      confirmText: '确认报价'
    });
    if (!ok) return;
    try {
      await invoke('confirmQuote', { id: order.id });
      toast('已确认，开始代买');
    } catch (e) {
      toast(e.message || '确认失败');
    }
    loadOrders({ silent: true });
  }

  function copyWechat() {
    if (!ownerWechat) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ownerWechat).then(() => toast('微信号已复制')).catch(() => toast('复制失败，请手动记录'));
      return;
    }
    toast('请长按选择微信号复制');
  }

  return (
    <div className="screen screen-padded orders-page">
      <NavBar title="我的需求" />
      <div className="orders-head">
        <div className="orders-title">我的需求</div>
        <div className="orders-sub">查看需求登记、备货与送达进度</div>
      </div>

      <Banner>这里记录您提交的需求登记，仅用于进度沟通，不涉及在线支付；实际商品与费用请在线下当面确认。</Banner>

      {ownerWechat ? (
        <div className="wechat-tip">
          <span className="wechat-tip-text">订单有疑问？添加店主微信 <strong className="wechat-id">{ownerWechat}</strong> 方便沟通</span>
          <button type="button" className="wechat-copy" onClick={copyWechat}>复制</button>
        </div>
      ) : null}

      <div className="chip-scroll order-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`chip ${activeTab === tab.id ? 'selected' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="正在加载…" /> : null}
      {!loading && error ? (
        <div className="message-line">
          <div>{error}</div>
          <button type="button" className="retry" onClick={() => loadOrders()}>点击重试</button>
        </div>
      ) : null}

      {!loading && !error && filtered.length ? filtered.map(item => (
        <article key={item.id} className="order-card">
          <div className="card-top">
            <div className="shop-line">
              <span className="shop-mark">{item.orderType === 'express' ? '取' : item.orderType === 'purchase' ? '买' : '铺'}</span>
              <span className="shop-name">{item.kindText}</span>
              <span className="shop-arrow">›</span>
            </div>
            <span className={`order-status status-${item.status}`}>{item.statusText}</span>
          </div>

          {item.progress >= 0 ? (
            <div className="steps">
              {STEPS.map((step, index) => (
                <div key={step} className={`step ${item.progress > index ? 'done' : item.progress === index ? 'current' : ''}`}>
                  <span className="step-dot" />
                  <span className="step-text">{step}</span>
                </div>
              ))}
            </div>
          ) : <div className="steps cancelled"><span className="step-text">{item.stepText}</span></div>}

          <div className="card-body">
            {item.thumbs.length ? (
              <div className="thumbs">
                {item.thumbs.map(thumb => (
                  <div key={thumb.id} className={`thumb tone-${thumb.tone}`}>
                    {thumb.image ? <img className="thumb-image" src={thumb.image} alt={thumb.name} /> : thumb.initials}
                  </div>
                ))}
                {item.moreCount > 0 ? <div className="thumb-more">+{item.moreCount}</div> : null}
              </div>
            ) : null}
            <div className="body-right">
              <div className="body-lines">{item.orderType === 'goods' ? item.linesText : item.summaryText}</div>
              <div className="body-time">{item.deliveryText}</div>
              {item.quoteText ? <div className="body-quote">{item.quoteText}</div> : null}
            </div>
          </div>

          <div className="card-foot">
            <div className="foot-sum">
              <span>{item.orderType === 'goods' ? `共 ${item.count} 件 · 合计` : `${item.kindText} · 合计`}</span>
              <span className="foot-total">¥{item.total}</span>
            </div>
            <div className="foot-actions">
              <button type="button" className="ghost-btn" onClick={() => setExpandedId(expandedId === item.id ? '' : item.id)}>
                {expandedId === item.id ? '收起详情' : '查看详情'}
              </button>
              {item.canConfirmQuote ? (
                <button type="button" className="solid-btn" onClick={() => confirmQuote(item)}>确认报价</button>
              ) : null}
              {item.canCancel ? <button type="button" className="ghost-btn" onClick={() => cancel(item)}>取消订单</button> : null}
              {item.canDelete ? <button type="button" className="ghost-btn" onClick={() => remove(item)}>删除订单</button> : null}
            </div>
          </div>

          {expandedId === item.id ? (
            <div className="card-detail">
              <div className="detail-row"><span className="detail-label">登记编号</span><span className="detail-value break">{item.id}</span></div>
              <div className="detail-row"><span className="detail-label">收货信息</span><span className="detail-value">{item.recipient} · {item.phone}</span></div>
              <div className="detail-row"><span className="detail-label">送达地址</span><span className="detail-value">{item.address}</span></div>
              <div className="detail-row"><span className="detail-label">送达方式</span><span className="detail-value">{item.contactText} · {item.delivery}</span></div>
              {item.note ? <div className="detail-row"><span className="detail-label">备注</span><span className="detail-value">{item.note}</span></div> : null}
              {item.orderType === 'goods' ? (
                <>
                  <div className="detail-goods">
                    {item.lines.map(line => (
                      <div key={line.id} className="goods-row">
                        <span className="goods-name">{line.name} <span className="goods-spec">{line.spec}</span></span>
                        <span className="goods-qty">×{line.quantity}</span>
                        <span className="goods-price">¥{line.subtotal}</span>
                      </div>
                    ))}
                  </div>
                  <div className="detail-row sum"><span className="detail-label">商品小计</span><span className="detail-value">¥{item.subtotal}</span></div>
                  <div className="detail-row sum"><span className="detail-label">上门配送费</span><span className="detail-value">¥{item.deliveryFee}</span></div>
                </>
              ) : (
                <>
                  {item.serviceLines.map(line => (
                    <div key={line.label} className="detail-row">
                      <span className="detail-label">{line.label}</span>
                      <span className="detail-value">{line.value}</span>
                    </div>
                  ))}
                  <div className="detail-row sum"><span className="detail-label">{item.feeLabel}</span><span className="detail-value">{item.feeText}</span></div>
                </>
              )}
              <div className="detail-row sum total">
                <span className="detail-label">参考合计 · 线下结算</span>
                <span className="detail-value">¥{item.total}</span>
              </div>
            </div>
          ) : null}
        </article>
      )) : null}

      {!loading && !error && filtered.length ? (
        <div className="order-bottom">已显示最近 {filtered.length} 条登记 · 进度自动更新</div>
      ) : null}

      {!loading && !error && !filtered.length ? (
        <EmptyState
          title="还没有相关登记"
          copy="把想要的商品记进清单并登记后，进度会显示在这里。"
          action={<button type="button" className="primary-action empty-action" onClick={() => redirect('/')}>去逛便利铺　→</button>}
        />
      ) : null}
    </div>
  );
}
