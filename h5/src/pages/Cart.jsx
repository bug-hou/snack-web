import { useEffect, useState } from 'react';
import { NavBar } from '../components/Layout';
import { Banner, Spinner, EmptyState } from '../components/Bits';
import { navigate } from '../lib/router';
import { useCart, change, clear } from '../lib/cart';
import { getProducts, loadProducts } from '../lib/catalog';
import { peekContext, loadContext } from '../lib/shop';
import { confirm } from '../lib/ui';

const moneyText = cents => ((Number.isSafeInteger(cents) ? cents : 0) / 100).toFixed(2);

export default function Cart() {
  const cart = useCart();
  const [config, setConfig] = useState(() => peekContext());
  const [ready, setReady] = useState(() => !!peekContext());
  const [loading, setLoading] = useState(() => !getProducts().length);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(!getProducts().length);
    Promise.all([loadProducts(), loadContext()])
      .then(([, next]) => {
        if (!alive) return;
        setConfig(next);
        setReady(true);
        setLoading(false);
        setError('');
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setReady(false);
        setError('暂时无法确认商品和配送信息，请稍后重试');
      });
    return () => { alive = false; };
  }, []);

  const feeCents = Number.isSafeInteger(config && config.deliveryFeeCents) ? config.deliveryFeeCents : 0;
  const minCents = Number.isSafeInteger(config && config.minOrderCents) ? config.minOrderCents : 0;
  const subtotalCents = Math.round(Number(cart.total) * 100);
  const payable = ((subtotalCents + feeCents) / 100).toFixed(2);
  const belowMinimum = subtotalCents < minCents;

  async function clearCart() {
    const ok = await confirm({
      title: '清空需求清单',
      content: '确定移除清单里的全部商品吗？',
      confirmText: '清空',
      danger: true
    });
    if (ok) clear();
  }

  function goCheckout() {
    if (!cart.count || !ready || error) return;
    if (belowMinimum) { navigate('/'); return; }
    navigate('/checkout');
  }

  return (
    <div className="screen screen-padded cart-page">
      <NavBar title="需求清单" />
      <div className="page-lead">
        <div className="small-kicker">MY LIST / 需求清单</div>
        <div className="page-title">日常所需都在这<span className="title-period">.</span></div>
        <div className="page-sub">挑好想买的，登记后由店家与您线下确认，线下当面结算</div>
      </div>

      <Banner>清单只记录您想要的商品与数量，不构成订单。提交后会生成一条需求登记，由店家线下与您联系确认。</Banner>

      {loading ? <Spinner label="正在加载清单…" /> : null}

      {!loading && cart.count ? (
        <>
          <section className="cart-card">
            <div className="cart-header">
              <span>已选 {cart.count} 件</span>
              <button type="button" className="clear-link" onClick={clearCart}>清空清单</button>
            </div>
            {cart.items.map(item => (
              <div key={item.id} className="cart-item">
                <div className={`cart-art tone-${item.tone}`}>
                  {item.image
                    ? <img className="cart-image" src={item.image} alt={item.name} />
                    : <span className="cart-pack">{item.initials}</span>}
                </div>
                <div className="cart-info">
                  <div className="cart-name">{item.name}</div>
                  <div className="cart-spec">{item.spec}</div>
                  <div className="cart-price">¥{item.price}</div>
                </div>
                <div className="cart-controls">
                  <button type="button" className="cart-btn" onClick={() => change(item.id, -1)} aria-label="减少">－</button>
                  <span>{item.quantity}</span>
                  <button type="button" className="cart-btn plus" onClick={() => change(item.id, 1)} aria-label="增加">＋</button>
                </div>
              </div>
            ))}
          </section>

          <section className="cart-summary">
            <div className="summary-row"><span>商品参考金额</span><span>¥{cart.total}</span></div>
            <div className="summary-row"><span>预计跑腿配送费</span><span>¥{moneyText(feeCents)}</span></div>
            <div className="summary-divider" />
            <div className="summary-row emphasis"><span>参考合计</span><span>¥{payable}</span></div>
          </section>

          {belowMinimum ? <div className="notice-card">商品满 ¥{moneyText(minCents)} 起送，再挑点喜欢的吧。</div> : null}
          {error ? <div className="notice-card">{error}</div> : null}

          <div className="cart-footer dock">
            <div className="cart-footer-price">
              <span>参考合计</span>
              <strong>¥{payable}</strong>
            </div>
            <button type="button" className="primary-action" onClick={goCheckout}>
              {belowMinimum ? '继续挑选' : '登记需求　→'}
            </button>
          </div>
        </>
      ) : null}

      {!loading && !cart.count ? (
        <EmptyState
          title="清单还空空的"
          copy="家里缺什么？鸡蛋、牛奶、纸巾都可以先记下来"
          action={<button type="button" className="primary-action empty-action" onClick={() => navigate('/')}>去挑商品　→</button>}
        />
      ) : null}
    </div>
  );
}
