import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { Banner } from '../components/Bits';
import { navigate } from '../lib/router';
import { getProducts, loadProducts, categories } from '../lib/catalog';
import { useCart, change } from '../lib/cart';
import { peekContext, loadContext, getAddresses, peekAddresses } from '../lib/shop';
import { invoke } from '../lib/cloud';
import { decorateServices, services } from '../lib/data';
import { useCloudImages } from '../lib/useCloudImages';

const SHARE_TONES = ['peach', 'sage', 'butter'];

function shopStatusText(config) {
  if (!config) return '';
  return config.isOpen ? '接单中' : config.ordersEnabled ? '当前休息中' : '暂未营业';
}

export default function Home() {
  const cart = useCart();
  const [config, setConfig] = useState(() => peekContext());
  const [catalog, setCatalog] = useState(() => getProducts());
  const [loading, setLoading] = useState(() => !getProducts().length);
  const [catalogError, setCatalogError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [shares, setShares] = useState([]);
  const [shareHint, setShareHint] = useState('正在加载邻里闲置…');
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

  const loadShares = useCallback(async () => {
    try {
      const list = await invoke('listShares', { scope: 'all' });
      const decorated = list.slice(0, 3).map((item, index) => ({
        id: item.id,
        title: item.title,
        modeText: item.modeText,
        priceText: item.mode === 'sale' ? `¥${item.price}` : '免费',
        cover: item.images && item.images.length ? item.images[0] : '',
        initials: (item.title || '闲置').slice(0, 2),
        tone: SHARE_TONES[index % SHARE_TONES.length]
      }));
      setShares(decorated);
      setShareHint(decorated.length ? '' : '还没有邻居发布闲置，成为第一个吧');
    } catch (error) {
      setShareHint('闲置加载失败，稍后重试');
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadShares();
    loadContext().then(next => { setConfig(next); return getAddresses(); })
      .then(result => applyAddress(result.selected))
      .catch(() => { /* 保留缓存中的状态 */ });
  }, [loadCatalog, loadShares, applyAddress]);

  const quantities = useMemo(() => {
    const map = {};
    cart.items.forEach(item => { map[item.id] = item.quantity; });
    return map;
  }, [cart.items]);

  const featured = useMemo(() => catalog.filter(product => product.featured), [catalog]);

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return catalog.filter(product =>
      (activeCategory === 'all' || product.category === activeCategory)
      && (!text || product.name.toLowerCase().includes(text) || product.spec.toLowerCase().includes(text))
    ).map(product => ({ ...product, quantity: quantities[product.id] || 0 }));
  }, [catalog, activeCategory, keyword, quantities]);

  const shareImages = useCloudImages(shares.map(item => item.cover));
  const serviceList = decorateServices(config);

  function openService(id) {
    if (!services.some(service => service.id === id)) return;
    if (id === 'secondhand') { navigate('/shares'); return; }
    navigate(`/errand/${id}`);
  }

  const addressText = address ? `保利爱尚里 ${address.building}栋 ${address.room}` : '添加收货地址';
  const addressHint = address ? `${address.recipient} · 送到家门口` : '选择楼栋和门牌号，送货上门';

  return (
    <div className="screen screen-tabbed home-page">
      <header className="community-header">
        <div className="community-brand">
          <span className="brand-mark">里</span>
          <div>
            <div className="brand-name">爱尚里生活</div>
            <div className="brand-kicker">家门口的小事，一起办好</div>
          </div>
        </div>
        <button type="button" className="header-orders" onClick={() => navigate('/orders')}>
          <Icon name="clipboard" size={18} />
          <span>我的登记</span>
        </button>
      </header>

      <div className="shop-content">
        <Banner>
          本页为社区便民信息展示，只提供商品信息与参考价，不提供在线下单、在线支付与交易担保。有需要请先加入需求清单，再由店家线下与您确认。
        </Banner>

        <button type="button" className="address-entry" onClick={() => navigate('/address')}>
          <Icon name="pin" size={18} className="address-pin" />
          <span className="address-copy">
            <span className="address-current">{addressText}</span>
            <span className="address-sub">{addressHint}</span>
          </span>
          <span className="address-arrow">›</span>
        </button>

        <div className="community-intro">
          <div className="intro-copy">
            <div className="intro-kicker">YOUR NEIGHBOURHOOD, CLOSER.</div>
            <div className="intro-title">生活的小事<span>，</span><div>不用跑远。</div></div>
            <div className="intro-desc">取快递 · 买日常 · 分享好物</div>
          </div>
          <div className="neighbour-art" aria-hidden="true">
            <span className="art-circle" />
            <span className="art-circle small" />
            <span className="art-label">HELLO NEIGHBOUR</span>
          </div>
        </div>

        <div className="service-heading">
          <span>今天需要什么？</span>
          <span className="service-heading-note">社区服务</span>
        </div>
        <div className="service-list">
          {serviceList.map(item => (
            <button
              key={item.id}
              type="button"
              className={`service-card service-${item.id}`}
              onClick={() => openService(item.id)}
            >
              <span className={`service-icon icon-${item.icon}`}>
                <Icon name={item.icon === 'bag' ? 'bag' : item.icon === 'repeat' ? 'repeat' : 'package'} size={21} />
              </span>
              <span className="service-copy">
                <span className="service-title-row">
                  <span className="service-title">{item.shortTitle}</span>
                  {item.text ? <span className={`service-state ${item.tone}`}>{item.text}</span> : null}
                </span>
                <span className="service-subtitle">
                  {item.id === 'purchase' ? '京东便利店 · 非官方代买' : item.subtitle}
                </span>
              </span>
              <span className="service-arrow">›</span>
            </button>
          ))}
        </div>

        <div className="section-head">
          <div>
            <div className="section-eyebrow">PASS IT ON</div>
            <div className="section-name">邻里闲置</div>
          </div>
          <button type="button" className="section-link" onClick={() => navigate('/shares')}>全部 ›</button>
        </div>

        {shares.length ? (
          <div className="share-row">
            {shares.map(item => {
              const cover = shareImages(item.cover);
              return (
                <button key={item.id} type="button" className="share-card" onClick={() => navigate(`/shares/${item.id}`)}>
                  <span className={`share-art tone-${item.tone}`}>
                    {cover ? <img className="share-image" src={cover} alt={item.title} /> : item.initials}
                  </span>
                  <span className="share-title">{item.title}</span>
                  <span className="share-meta">
                    <span className="share-mode">{item.modeText}</span>
                    <span className="share-price">{item.priceText}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" className="sharing-card" onClick={loadShares}>
            <span className="sharing-symbol"><Icon name="repeat" size={19} /></span>
            <span className="sharing-copy">
              <span className="sharing-title">让好物，在小区里接力</span>
              <span className="sharing-desc">{shareHint}</span>
            </span>
          </button>
        )}
        <button type="button" className="publish-button" onClick={() => navigate('/shares/new')}>
          <Icon name="plus" size={15} />
          <span>发布闲置</span>
        </button>

        <div className="section-head">
          <div>
            <div className="section-eyebrow">NEIGHBOUR TALK</div>
            <div className="section-name">邻里广场</div>
          </div>
        </div>
        <button type="button" className="forum-entry" onClick={() => navigate('/forum')}>
          <span className="forum-entry-copy">
            <span className="forum-entry-title">和邻居聊两句</span>
            <span className="forum-entry-desc">闲聊 · 互助求助 · 失物招领 · 社区公告</span>
          </span>
          <span className="forum-entry-arrow">›</span>
        </button>

        <div className="section-head catalog-head">
          <div>
            <div className="section-eyebrow">DAILY ESSENTIALS</div>
            <div className="section-name">便利铺 · 商品信息</div>
          </div>
          {shopStatusText(config) ? <span className="shop-state">{shopStatusText(config)}</span> : null}
        </div>
        <div className="catalog-caption">原口袋便利铺商品 · 与便利店代买服务分开</div>

        {featured.length ? (
          <div className="featured-scroll">
            {featured.map(item => (
              <div key={item.id} className="featured-item">
                <div className={`featured-art tone-${item.tone}`}>
                  {item.image
                    ? <img className="featured-image" src={item.image} alt={item.name} loading="lazy" />
                    : <span className="mini-pack">{item.initials}</span>}
                </div>
                <div className="featured-label">{item.name}</div>
                <div className="featured-price">
                  ¥{item.price}
                  <button type="button" className="featured-add" onClick={() => change(item.id, 1)} aria-label={`把${item.name}加入需求清单`}>＋</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

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
                ? <div className="want-hint in-list">已在需求清单 · 数量 {item.quantity}</div>
                : <div className="want-hint">需要就点 ＋，先记在清单里</div>}
            </div>
          ))}
        </div>

        {loading ? <div className="empty-results">正在加载商品…</div> : null}
        {!loading && catalogError ? (
          <div className="empty-results clickable" onClick={loadCatalog} role="button">{catalogError}</div>
        ) : null}
        {!loading && !catalogError && !visible.length ? (
          <div className="empty-results">{keyword ? '没找到这件商品，换个关键词试试' : '暂时没有上架商品，稍后再来看看'}</div>
        ) : null}

        <div className="bottom-note">保利爱尚里 · 爱尚里生活</div>
      </div>

      {cart.count ? (
        <div className="floating-cart dock dock-raised" onClick={() => navigate('/cart')} role="button">
          <div>
            <div className="floating-count">清单 {cart.count} 件</div>
            <div className="floating-price">参考 ¥{cart.total}</div>
          </div>
          <div className="floating-button">查看需求清单　→</div>
        </div>
      ) : null}
    </div>
  );
}
