import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { SkeletonList } from '../components/Bits';
import { navigate } from '../lib/router';
import { getProducts, loadProducts, categories } from '../lib/catalog';
import { useCart, change } from '../lib/cart';
import { peekContext, loadContext, getAddresses, peekAddresses } from '../lib/shop';
import { SERVICE_ENTRIES, serviceBadge, serviceSummary } from '../lib/data';

function shopStatusText(config) {
  if (!config) return '';
  return config.isOpen ? '接单中' : config.ordersEnabled ? '休息中' : '未营业';
}

export default function Home() {
  const cart = useCart();
  const [config, setConfig] = useState(() => peekContext());
  const [catalog, setCatalog] = useState(() => getProducts());
  const [loading, setLoading] = useState(() => !getProducts().length);
  const [catalogError, setCatalogError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [address, setAddress] = useState(() => {
    const cached = peekAddresses();
    return cached ? cached.selected : null;
  });

  const applyAddress = useCallback(selected => setAddress(selected), []);

  const loadCatalog = useCallback(async () => {
    setLoading(!getProducts().length);
    setCatalogError('');
    try {
      await loadProducts();
      setCatalog(getProducts());
      setLoading(false);
    } catch (error) {
      setCatalog(getProducts());
      setLoading(false);
      setCatalogError('商品加载失败，点击重试');
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadContext().then(next => { setConfig(next); return getAddresses(); })
      .then(result => applyAddress(result.selected))
      .catch(() => { /* 保留缓存中的状态 */ });
  }, [loadCatalog, applyAddress]);

  const quantities = useMemo(() => {
    const map = {};
    cart.items.forEach(item => { map[item.id] = item.quantity; });
    return map;
  }, [cart.items]);

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return catalog.filter(product =>
      (activeCategory === 'all' || product.category === activeCategory)
      && (!text || product.name.toLowerCase().includes(text) || product.spec.toLowerCase().includes(text))
    ).map(product => ({ ...product, quantity: quantities[product.id] || 0 }));
  }, [catalog, activeCategory, keyword, quantities]);

  const addressText = address ? `${address.building}栋 ${address.room}` : '添加收货地址';
  const addressHint = address ? `${address.recipient} · 送到家门口` : '选择楼栋和门牌号，送货上门';

  return (
    <div className="screen screen-tabbed home-page">
      <header className="home-top">
        <button type="button" className="home-address" onClick={() => navigate('/address')}>
          <Icon name="pin" size={18} />
          <span className="home-address-copy">
            <strong>{addressText}</strong>
            <small>{addressHint}</small>
          </span>
          <span className="home-address-arrow">{address ? '切换' : '添加'}</span>
        </button>
        <button type="button" className="home-orders" onClick={() => navigate('/orders')}>
          <Icon name="clipboard" size={20} />
          <span>我的登记</span>
        </button>
      </header>

      <section className="home-block">
        <div className="sec-head">
          <h2>社区服务</h2>
          <span className="sec-note">保利爱尚里 16 / 17 / 18 栋</span>
        </div>
        <div className="svc-grid">
          {SERVICE_ENTRIES.map(item => {
            const badge = serviceBadge(config, item.id);
            return (
              <button key={item.id} type="button" className="svc-card" onClick={() => navigate(item.path)}>
                <span className="svc-ico"><Icon name={item.icon} size={20} /></span>
                <span className="svc-copy">
                  <span className="svc-name-row">
                    <strong>{item.name}</strong>
                    <span className={`svc-state ${badge.tone}`}>{badge.text}</span>
                  </span>
                  <span className="svc-desc">{serviceSummary(config, item.id)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-block">
        <div className="sec-head">
          <h2>便利铺</h2>
          {shopStatusText(config) ? <span className="sec-note">{shopStatusText(config)}</span> : null}
        </div>

        <div className="search-box">
          <Icon name="search" size={15} className="search-icon" />
          <input
            className="search-input"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="搜索鸡蛋、牛奶、日用品"
          />
          {keyword ? (
            <button type="button" className="clear-search" onClick={() => setKeyword('')}>清除</button>
          ) : null}
        </div>

        <div className="chip-scroll">
          {categories.map(item => (
            <button
              key={item.id}
              type="button"
              className={`chip ${activeCategory === item.id ? 'selected' : ''}`}
              onClick={() => setActiveCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="product-grid">
          {visible.map(item => (
            <div key={item.id} className="product-card">
              <div className={`product-art tone-${item.tone}`}>
                {item.image
                  ? <img className="product-image" src={item.image} alt={item.name} loading="lazy" />
                  : <span className="product-pack"><span className="pack-name">{item.initials}</span></span>}
                {item.label ? <span className="product-tag">{item.label}</span> : null}
              </div>
              <div className="product-name">{item.name}</div>
              <div className="product-spec">{item.spec}</div>
              <div className="product-price-row">
                <span className="product-price"><span>¥</span>{item.price}</span>
                <span className="price-note">参考价</span>
              </div>
              <div className="qty-controls">
                {item.quantity ? (
                  <>
                    <button type="button" className="qty-minus" onClick={() => change(item.id, -1)} aria-label="减少">－</button>
                    <span className="qty-value">{item.quantity}</span>
                  </>
                ) : null}
                <button type="button" className="qty-plus" onClick={() => change(item.id, 1)} aria-label="加入需求清单">＋</button>
              </div>
              {item.quantity
                ? <div className="want-hint in-list">已在清单 · {item.quantity} 件</div>
                : <div className="want-hint">需要就点 ＋</div>}
            </div>
          ))}
        </div>

        {loading ? <SkeletonList count={4} kind="card" /> : null}
        {!loading && catalogError ? (
          <div className="empty-results clickable" onClick={loadCatalog} role="button">{catalogError}</div>
        ) : null}
        {!loading && !catalogError && !visible.length ? (
          <div className="empty-results">{keyword ? '没找到这件商品，换个关键词试试' : '暂时没有上架商品，稍后再来看看'}</div>
        ) : null}
      </section>

      {cart.count ? (
        <div className="floating-cart dock dock-raised" onClick={() => navigate('/cart')} role="button">
          <div>
            <div className="floating-count">清单 {cart.count} 件</div>
            <div className="floating-price">参考 ¥{cart.total}</div>
          </div>
          <div className="floating-button">查看清单　→</div>
        </div>
      ) : null}
    </div>
  );
}
