import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, invoke, uploadProductImage, resolveImage } from './cloud';
import './style.css';

const STATUS = { pending: '待处理', processing: '订单处理中', confirmed: '订单处理中', packed: '配货完成', delivering: '配送中', completed: '配送完成', cancelled: '已取消' };
const NEXT = { pending: ['processing', '开始处理'], processing: ['packed', '完成配货'], confirmed: ['packed', '完成配货'], packed: ['delivering', '开始配送'], delivering: ['completed', '确认送达'] };
const CATEGORIES = { fresh: '新鲜食材', household: '居家日用', dairy: '牛奶乳品' };
const PRODUCT_IMAGES = { '/images/products/eggs.jpg': '鸡蛋', '/images/products/tissue.jpg': '卫生纸', '/images/products/milk.jpg': '牛奶' };
const DEFAULTS = { ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00', deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0, ownerOpenid: '', ownerWechat: '' };
const BLANK_PRODUCT = { name: '', spec: '', category: 'fresh', price: '', label: '', tone: 'peach', image: '', featured: false, is_available: false };
const yuan = value => `¥${((value || 0) / 100).toFixed(2)}`;
const moneyToCents = value => Math.round(Number(value) * 100);
const contactText = { knock: '请敲门', call: '到达后打电话', no_knock: '不要敲门' };

const POLL_MS = 15000;
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.25].forEach(offset => {
      const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + offset + 0.2);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + offset); osc.stop(audioCtx.currentTime + offset + 0.2);
    });
  } catch (e) { /* 浏览器不支持时忽略 */ }
}
function speak(text, times = 2) {
  beep();
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    for (let i = 0; i < times; i++) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1;
      window.speechSynthesis.speak(u);
    }
  } catch (e) { /* 忽略 */ }
}

function ProductImage({ src, alt, fallback }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    resolveImage(src).then(u => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);
  return url ? <img src={url} alt={alt} /> : <>{fallback}</>;
}

function App() {
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState(false);
  const [currentUid, setCurrentUid] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('bughou');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('orders');
  const [settings, setSettings] = useState(DEFAULTS);
  const [feeInput, setFeeInput] = useState({ min: '0.00', delivery: '0.00' });
  const [orders, setOrders] = useState([]);
  const [orderPage, setOrderPage] = useState(1);
  const [more, setMore] = useState(false);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState({ list: [], page: 1, total: 0, hasMore: false });
  const [userKeyword, setUserKeyword] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('voiceAlert') !== 'off');
  const [audioReady, setAudioReady] = useState(() => !!(navigator.userActivation && navigator.userActivation.hasBeenActive));
  const seenRef = useRef(null);
  const voiceRef = useRef(voiceOn);
  const viewRef = useRef({ tab, orderPage: 1 });
  voiceRef.current = voiceOn;
  viewRef.current = { tab, orderPage };

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next); localStorage.setItem('voiceAlert', next ? 'on' : 'off');
    if (next) speak('语音提醒已开启', 1);
  }
  useEffect(() => {
    if (audioReady) return undefined;
    const unlock = () => setAudioReady(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [audioReady]);
  useEffect(() => {
    if (!authorised) { seenRef.current = null; return undefined; }
    let stopped = false;
    async function poll() {
      try {
        const result = await invoke('getOrders', { page: 1 });
        if (stopped) return;
        const list = result.list || [];
        const ids = new Set(list.map(o => o._id));
        if (seenRef.current === null) { seenRef.current = ids; return; }
        const fresh = list.filter(o => !seenRef.current.has(o._id) && o.status === 'pending');
        ids.forEach(id => seenRef.current.add(id));
        if (fresh.length) {
          if (voiceRef.current) speak(fresh.length > 1 ? `您有${fresh.length}个新订单，请及时处理` : '您有新订单，请及时处理');
          setMessage(`收到 ${fresh.length} 个新订单`); setTimeout(() => setMessage(''), 6000);
          if (viewRef.current.tab === 'orders' && viewRef.current.orderPage === 1) { setOrders(list); setMore(!!result.hasMore); }
        }
      } catch (e) { /* 轮询失败时静默，下次重试 */ }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [authorised]);

  const notify = text => { setMessage(text); setTimeout(() => setMessage(''), 3600); };
  async function loadOrders(page = 1) {
    setLoading(true);
    try {
      const result = await invoke('getOrders', { page });
      setOrders(result.list || []); setOrderPage(page); setMore(!!result.hasMore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadProducts() {
    setLoading(true);
    try { setProducts(await invoke('getProducts')); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadUsers(page = 1, keyword = userKeyword) {
    setLoading(true);
    try { setUsers(await invoke('getUsers', { page, keyword })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function openUser(user) {
    setUserDetail({ user, orders: [], addresses: [], loading: true });
    try {
      const detail = await invoke('getUserDetail', { openid: user.openid });
      setUserDetail({ user, ...detail, loading: false });
    } catch (e) { setUserDetail(null); setError(e.message); }
  }
  async function verify() {
    setChecking(true);
    try {
      const state = await auth.getLoginState();
      if (!state || !state.user) { setSession(false); setAuthorised(false); return; }
      setSession(true);
      setCurrentUid(state.user.uid || state.user.sub || '');
      const result = await invoke('getDashboard');
      setSettings({ ...DEFAULTS, ...result.settings });
      setFeeInput({ min: ((result.settings?.minOrderCents || 0) / 100).toFixed(2),
        delivery: ((result.settings?.deliveryFeeCents || 0) / 100).toFixed(2) });
      setAuthorised(true); setError('');
      await loadOrders();
    } catch (e) { setAuthorised(false); setError(e.message || '身份验证失败'); }
    finally { setChecking(false); }
  }
  useEffect(() => { verify(); }, []);

  async function login(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await auth.signIn({ username: username.trim(), password });
      setPassword('');
      await verify();
    } catch (e) { setError(e.message || '登录失败，请检查账号与密码'); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await auth.signOut(); } catch (e) { setError('退出失败，请稍后重试'); return; }
    setSession(false); setCurrentUid(''); setAuthorised(false); setOrders([]); setPassword(''); setError('');
  }
  function changeTab(next) {
    setTab(next); setError(''); setUserDetail(null);
    if (next === 'orders') loadOrders();
    if (next === 'products') loadProducts();
    if (next === 'users') loadUsers(1);
  }
  async function advance(order, status) {
    if (busy) return;
    setBusy(true); setError('');
    try { await invoke('changeStatus', { id: order._id, status }); await loadOrders(orderPage); notify('订单状态已更新'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveSettings(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const data = { ...settings, minOrderCents: moneyToCents(feeInput.min), deliveryFeeCents: moneyToCents(feeInput.delivery) };
      const result = await invoke('saveSettings', data);
      setSettings({ ...DEFAULTS, ...result });
      setFeeInput({ min: (result.minOrderCents / 100).toFixed(2), delivery: (result.deliveryFeeCents / 100).toFixed(2) });
      notify('营业与配送设置已保存，小程序将同步生效');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function editProduct(product) {
    setEditor(product ? { ...product, id: product._id, price: (product.priceCents / 100).toFixed(2) } : { ...BLANK_PRODUCT });
    setError('');
  }
  async function pickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fileID = await uploadProductImage(file);
      setEditor(prev => ({ ...prev, image: fileID }));
    } catch (err) { setError(err.message || '图片上传失败'); }
    finally { setUploading(false); }
  }
  async function saveProduct(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const priceCents = moneyToCents(editor.price);
      if (!Number.isSafeInteger(priceCents) || priceCents < 1) throw new Error('请填写有效价格');
      await invoke('saveProduct', { ...editor, priceCents });
      setEditor(null); await loadProducts(); notify('商品已保存，小程序将展示最新商品信息');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (checking) return <div className="center-screen"><div className="loading-dot"/>正在进入商家管理…</div>;
  if (!authorised) return <div className="login-wrap"><div className="login-art"><span className="brand-sign">口袋便利铺 <b>●</b></span><div className="login-art-copy">把好商品送到<br/>家门口。</div><div className="art-card">POLY · 16 / 17 / 18</div></div><div className="login-panel"><div className="login-card"><span className="eyebrow">POCKET SNACKS · ADMIN</span><h1>{session ? '尚未开通店主权限' : '欢迎回来'}</h1><p>{session ? '当前账号已登录，但尚未被设为这家小店的店主。请完成后台身份绑定。' : '登录后管理订单、商品与营业设置。'}</p>{session ? <><div className="uid-note">当前账号 UID：<strong>{currentUid || '请到 CloudBase 控制台查看'}</strong></div><button className="main-btn" onClick={logout}>退出当前账号</button></> : <form onSubmit={login}><label>商家账号<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label><label>登录密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="main-btn" disabled={busy}>{busy ? '正在登录…' : '登录商家端'}</button></form>}{error && <div className="error-box" role="alert">{error}</div>}<div className="login-foot">仅店主本人可访问 · 请使用安全密码</div></div></div></div>;

  return <div className="admin-layout"><aside className="sidebar"><div className="side-brand">口袋便利铺 <span>●</span><small>保利爱尚里 · 商家管理</small></div><nav><button className={tab === 'orders' ? 'nav-active' : ''} onClick={() => changeTab('orders')}>▦　订单管理</button><button className={tab === 'products' ? 'nav-active' : ''} onClick={() => changeTab('products')}>◈　商品管理</button><button className={tab === 'users' ? 'nav-active' : ''} onClick={() => changeTab('users')}>♟　用户管理</button><button className={tab === 'settings' ? 'nav-active' : ''} onClick={() => changeTab('settings')}>⚙　营业设置</button></nav><div className="side-bottom">16 / 17 / 18 栋专送<button onClick={logout}>退出登录</button></div></aside><main className="main-area"><header className="topbar"><span>小区生活，就在楼下</span><div className="topbar-right"><button className={'voice-btn' + (voiceOn ? ' on' : '')} onClick={toggleVoice} title="有新订单时语音播报">语音提醒：{voiceOn ? '开' : '关'}</button><span className="owner-badge">单商家 · 店主</span><button onClick={logout}>退出</button></div></header><div className="main-content">{error && <div className="error-box" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{voiceOn && !audioReady && <div className="error-box" role="status">请在页面任意位置点击一次，以启用新订单语音提醒（浏览器限制）。</div>}{message && <div className="success-box" role="status">{message}</div>}
    {tab === 'orders' && <><div className="heading-row"><div><span className="eyebrow">ORDER CENTER</span><h1>订单管理</h1><p>及时接单、配货与配送，让每份期待准时到家。</p></div><button className="outline-btn" onClick={() => loadOrders(orderPage)}>刷新订单</button></div><div className="stats-row"><div className="stat-card"><span>本页订单</span><strong>{orders.length}</strong><small>共显示最近 20 条 / 页</small></div><div className="stat-card"><span>待处理</span><strong>{orders.filter(o => o.status === 'pending').length}</strong><small>请尽快确认商品</small></div><div className="stat-card"><span>配送中</span><strong>{orders.filter(o => o.status === 'delivering').length}</strong><small>门口交付后确认完成</small></div></div>{loading ? <div className="empty-card">正在加载订单…</div> : orders.length ? <div className="order-list">{orders.map(o => <article className="order-card" key={o._id}><div className="order-top"><div><span className="order-id">订单 #{o._id.slice(-8).toUpperCase()}</span><span className="order-time">{new Date(o.createdAt).toLocaleString('zh-CN')}</span></div><span className={'status status-' + o.status}>{STATUS[o.status] || o.status}</span></div><div className="order-body"><div className="order-products">{(o.items || []).map((item,i) => <div key={item.id || i}><span>{item.name} ×{item.quantity}</span><strong>{yuan(item.subtotalCents)}</strong></div>)}<div className="order-totals"><span>商品 {yuan(o.subtotalCents ?? o.totalCents)} · 配送 {yuan(o.deliveryFeeCents)}</span><strong>合计 {yuan(o.totalCents)}</strong></div></div><div className="order-address"><strong>{o.address || '保利爱尚里'}</strong><span>{o.recipient}　{o.phone}</span><span>送达偏好：{contactText[o.contactPreference] || '请敲门'} · {o.delivery || '尽快送达'}</span>{o.note && <span>备注：{o.note}</span>}</div></div><div className="order-footer"><span>货到付款 · 送达后线下结算</span>{NEXT[o.status] && <button className="action-btn" disabled={busy} onClick={() => advance(o, NEXT[o.status][0])}>{NEXT[o.status][1]}　→</button>}</div></article>)}</div> : <div className="empty-card">暂无订单，收到新订单后会出现在这里。</div>}<div className="pager"><button className="outline-btn" disabled={orderPage === 1} onClick={() => loadOrders(orderPage - 1)}>上一页</button><span>第 {orderPage} 页</span><button className="outline-btn" disabled={!more} onClick={() => loadOrders(orderPage + 1)}>下一页</button></div></>}
    {tab === 'products' && <><div className="heading-row"><div><span className="eyebrow">SHELF MANAGEMENT</span><h1>商品管理</h1><p>在这里调整价格、分类与上架状态，小程序会同步更新。</p></div><button className="main-btn compact" onClick={() => editProduct(null)}>＋ 新增商品</button></div>{loading ? <div className="empty-card">正在加载商品…</div> : <div className="product-table">{products.map(p => <div className="product-row" key={p._id}><div className="product-thumb">{p.image ? <ProductImage src={p.image} alt={p.name} fallback={p.initials || p.name?.slice(0,2)} /> : p.initials || p.name?.slice(0,2)}</div><div className="product-main"><strong>{p.name}</strong><span>{CATEGORIES[p.category] || p.category} · {p.spec}</span></div><span className="product-money">{yuan(p.priceCents)}</span><span className={'availability ' + (p.is_available ? 'online' : '')}>{p.is_available ? '已上架' : '已下架'}</span><button className="text-btn" onClick={() => editProduct(p)}>编辑</button></div>)}</div>}{!loading && !products.length && <div className="empty-card">还没有商品，先上架第一件商品吧。</div>}</>}
    {tab === 'users' && (userDetail ? <>
      <div className="heading-row"><div><span className="eyebrow">CUSTOMER</span><h1>{userDetail.user.recipient || '未填写姓名'}</h1><p>{userDetail.user.phone || '未留手机号'} · {userDetail.user.building ? `${userDetail.user.building}栋${userDetail.user.room}` : '暂无地址'}</p></div><button className="outline-btn" onClick={() => setUserDetail(null)}>← 返回用户列表</button></div>
      <div className="stats-row"><div className="stat-card"><span>累计订单</span><strong>{userDetail.user.orderCount}</strong><small>含已取消订单</small></div><div className="stat-card"><span>累计消费</span><strong>{yuan(userDetail.user.spentCents)}</strong><small>不含已取消订单</small></div><div className="stat-card"><span>收货地址</span><strong>{userDetail.user.addressCount}</strong><small>最多保存 10 个</small></div></div>
      <div className="user-id-line">用户标识：<code>{userDetail.user.openid}</code></div>
      {userDetail.loading ? <div className="empty-card">正在加载用户详情…</div> : <>
        <h2 className="sub-heading">收货地址</h2>
        {userDetail.addresses.length ? <div className="user-addresses">{userDetail.addresses.map(a => <div className="user-address" key={a.id}><strong>{a.label} · 保利爱尚里 {a.building}栋 {a.room}</strong><span>{a.recipient}　{a.phone} · {contactText[a.contactPreference] || '请敲门'}</span></div>)}</div> : <div className="empty-card slim">该用户还没有保存地址</div>}
        <h2 className="sub-heading">最近订单（最多 50 条）</h2>
        {userDetail.orders.length ? <div className="order-list">{userDetail.orders.map(o => <article className="order-card" key={o._id}><div className="order-top"><div><span className="order-id">订单 #{o._id.slice(-8).toUpperCase()}</span><span className="order-time">{new Date(o.createdAt).toLocaleString('zh-CN')}{o.customerDeleted ? ' · 用户已删除' : ''}</span></div><span className={'status status-' + o.status}>{STATUS[o.status] || o.status}</span></div><div className="order-body"><div className="order-products">{(o.items || []).map((item, i) => <div key={item.id || i}><span>{item.name} ×{item.quantity}</span><strong>{yuan(item.subtotalCents)}</strong></div>)}<div className="order-totals"><span>商品 {yuan(o.subtotalCents ?? o.totalCents)} · 配送 {yuan(o.deliveryFeeCents)}</span><strong>合计 {yuan(o.totalCents)}</strong></div></div><div className="order-address"><strong>{o.address}</strong><span>{o.recipient}　{o.phone}</span><span>{o.delivery || '尽快送达'}</span>{o.note && <span>备注：{o.note}</span>}</div></div></article>)}</div> : <div className="empty-card slim">该用户还没有订单</div>}
      </>}
    </> : <>
      <div className="heading-row"><div><span className="eyebrow">CUSTOMERS</span><h1>用户管理</h1><p>查看所有下过单或保存过地址的顾客，共 {users.total} 位。</p></div><button className="outline-btn" onClick={() => loadUsers(users.page)}>刷新</button></div>
      <form className="user-search" onSubmit={e => { e.preventDefault(); loadUsers(1, userKeyword); }}><input value={userKeyword} maxLength={30} onChange={e => setUserKeyword(e.target.value)} placeholder="搜索姓名、手机号、楼栋门牌" /><button className="main-btn compact">搜索</button>{userKeyword && <button type="button" className="outline-btn" onClick={() => { setUserKeyword(''); loadUsers(1, ''); }}>清除</button>}</form>
      {loading ? <div className="empty-card">正在加载用户…</div> : users.list.length ? <div className="user-table"><div className="user-row user-head"><span>顾客</span><span>常用地址</span><span>订单数</span><span>累计消费</span><span>最近活跃</span><span></span></div>{users.list.map(u => <div className="user-row" key={u.openid}><span className="user-main"><strong>{u.recipient || '未填写姓名'}</strong><small>{u.phone || '—'}</small></span><span>{u.building ? `${u.building}栋 ${u.room}` : '—'}</span><span>{u.orderCount}</span><span>{yuan(u.spentCents)}</span><span>{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('zh-CN') : '—'}</span><button className="text-btn" onClick={() => openUser(u)}>查看</button></div>)}</div> : <div className="empty-card">{userKeyword ? '没有匹配的用户' : '还没有用户，顾客下单或保存地址后会出现在这里。'}</div>}
      <div className="pager"><button className="outline-btn" disabled={users.page === 1} onClick={() => loadUsers(users.page - 1)}>上一页</button><span>第 {users.page} 页</span><button className="outline-btn" disabled={!users.hasMore} onClick={() => loadUsers(users.page + 1)}>下一页</button></div>
    </>)}
    {tab === 'settings' && <><div className="heading-row"><div><span className="eyebrow">STORE SETTINGS</span><h1>营业设置</h1><p>本店只服务保利爱尚里 16、17、18 栋，设置保存后会同步到小程序。</p></div></div><form className="settings-grid" onSubmit={saveSettings}><section className="setting-card"><div className="setting-icon">01</div><h2>营业与配送</h2><p>每日按北京时间执行；关闭营业时，顾客无法提交订单。</p><label className="switch-line"><span><strong>接受新订单</strong><small>手动暂停接单时关闭</small></span><input type="checkbox" checked={!!settings.ordersEnabled} onChange={e => setSettings({ ...settings, ordersEnabled: e.target.checked })} /></label><div className="form-grid"><label>营业开始<input type="time" value={settings.businessStart} onChange={e => setSettings({ ...settings, businessStart: e.target.value })} required /></label><label>营业结束<input type="time" value={settings.businessEnd} onChange={e => setSettings({ ...settings, businessEnd: e.target.value })} required /></label><label>配送开始<input type="time" value={settings.deliveryStart} onChange={e => setSettings({ ...settings, deliveryStart: e.target.value })} required /></label><label>配送结束<input type="time" value={settings.deliveryEnd} onChange={e => setSettings({ ...settings, deliveryEnd: e.target.value })} required /></label></div><p className="fine-print">仅支持同日时段；营业与配送时段重合时，顾客才可下单。</p></section><section className="setting-card"><div className="setting-icon">02</div><h2>订单金额</h2><p>金额以元计；货到后线下结算，店铺不处理线上支付。</p><div className="form-grid"><label>最低起送金额（元）<input type="number" min="0" max="10000" step="0.01" value={feeInput.min} onChange={e => setFeeInput({ ...feeInput, min: e.target.value })} required /></label><label>每单配送费（元）<input type="number" min="0" max="100" step="0.01" value={feeInput.delivery} onChange={e => setFeeInput({ ...feeInput, delivery: e.target.value })} required /></label></div><p className="fine-print">起送金额按商品小计计算，不含配送费。</p><label className="owner-field">小程序店主身份标识（可选）<input value={settings.ownerOpenid || ''} onChange={e => setSettings({ ...settings, ownerOpenid: e.target.value })} placeholder="绑定后可在小程序中处理订单" /></label></section><section className="setting-card wide"><div className="setting-icon">03</div><h2>店主微信</h2><p>填写后，顾客在小程序「订单」页顶部会看到“添加店主微信方便沟通”的提示，点击可一键复制。</p><label className="owner-field">店主微信号<input value={settings.ownerWechat || ''} maxLength={40} onChange={e => setSettings({ ...settings, ownerWechat: e.target.value.trim() })} placeholder="例如 my_shop_wx" /></label><p className="fine-print">{settings.ownerWechat ? `小程序将显示：订单有疑问？添加店主微信 ${settings.ownerWechat} 方便沟通` : '当前未填写，小程序订单页不会显示该提示。'}</p></section><div className="save-row"><button className="main-btn compact" disabled={busy}>{busy ? '保存中…' : '保存营业设置'}</button></div></form></>}
    {editor && <div className="modal-backdrop" onClick={() => setEditor(null)}><form className="modal" onClick={e => e.stopPropagation()} onSubmit={saveProduct}><div className="modal-head"><h2>{editor.id ? '编辑商品' : '上架新商品'}</h2><button type="button" className="text-btn" onClick={() => setEditor(null)}>关闭</button></div><div className="form-grid"><label>商品名称<input maxLength="40" value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} required /></label><label>规格说明<input maxLength="60" value={editor.spec} onChange={e => setEditor({ ...editor, spec: e.target.value })} required /></label><label>分类<select value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })}>{Object.entries(CATEGORIES).map(([key, val]) => <option value={key} key={key}>{val}</option>)}</select></label><label>价格（元）<input type="number" min="0.01" max="10000" step="0.01" value={editor.price} onChange={e => setEditor({ ...editor, price: e.target.value })} required /></label><label>展示标签<input maxLength="12" value={editor.label || ''} onChange={e => setEditor({ ...editor, label: e.target.value })} /></label><label>商品图片（预设）<select value={PRODUCT_IMAGES[editor.image] ? editor.image : ''} onChange={e => setEditor({ ...editor, image: e.target.value })}><option value="">{editor.image && !PRODUCT_IMAGES[editor.image] ? '使用已上传图片' : '暂无图片'}</option>{Object.entries(PRODUCT_IMAGES).map(([path, label]) => <option value={path} key={path}>{label}</option>)}</select></label><div className="upload-field"><span>上传商品图片</span><div className="upload-box"><div className="upload-preview">{editor.image ? <ProductImage src={editor.image} alt="商品图片预览" fallback="加载中" /> : '暂无'}</div><div className="upload-actions"><label className="outline-btn upload-btn">{uploading ? '上传中…' : '选择图片'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={pickImage} /></label>{editor.image && <button type="button" className="text-btn" onClick={() => setEditor({ ...editor, image: '' })}>移除图片</button>}<small>支持 JPG / PNG / WebP，不超过 3MB</small></div></div></div><label>展示色系<select value={editor.tone || 'peach'} onChange={e => setEditor({ ...editor, tone: e.target.value })}>{['peach','cocoa','butter','sage','rose','mango','lemon','oat'].map(t => <option key={t} value={t}>{t}</option>)}</select></label></div><div className="check-row"><label><input type="checkbox" checked={!!editor.is_available} onChange={e => setEditor({ ...editor, is_available: e.target.checked })} />上架销售</label><label><input type="checkbox" checked={!!editor.featured} onChange={e => setEditor({ ...editor, featured: e.target.checked })} />首页推荐</label></div><button className="main-btn compact" disabled={busy || uploading}>{busy ? '保存中…' : '保存商品'}</button></form></div>}</div></main></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
