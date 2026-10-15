import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, invoke, uploadProductImage, resolveImage } from './cloud';
import ASSET_MAP from './assets-map.json';
import './style.css';

const STATUS = { pending: '待处理', quoted: '待确认报价', processing: '订单处理中', confirmed: '订单处理中', packed: '配货完成', delivering: '配送中', completed: '配送完成', cancelled: '已取消' };
const NEXT = { pending: ['processing', '开始处理'], processing: ['packed', '完成配货'], confirmed: ['packed', '完成配货'], packed: ['delivering', '开始配送'], delivering: ['completed', '确认送达'] };
const NEXT_PURCHASE = { pending: ['quoted', '填写报价'], quoted: ['processing', '开始代买'] };
const CATEGORIES = { fresh: '新鲜食材', household: '居家日用', dairy: '牛奶乳品' };
const PRESET_IMAGE_LABELS = { '/images/products/eggs.jpg': '鸡蛋', '/images/products/tissue.jpg': '卫生纸', '/images/products/milk.jpg': '牛奶' };
// 预设图已迁移到云存储（COS），值为 cloud:// fileID
const PRODUCT_IMAGES = Object.fromEntries(Object.entries(PRESET_IMAGE_LABELS).map(([legacy, label]) => [ASSET_MAP[legacy] || legacy, label]));
const DEFAULTS = { ordersEnabled: false, businessStart: '09:00', businessEnd: '22:00', deliveryStart: '09:00', deliveryEnd: '22:00', deliveryFeeCents: 0, minOrderCents: 0, ownerOpenid: '', ownerWechat: '',
  expressEnabled: false, expressFollowShop: false, expressBaseFeeCents: 300, expressExtraFeeCents: 100, expressLargeFeeCents: 100, expressStart: '09:00', expressEnd: '21:00', expressStations: [],
  purchaseEnabled: false, purchaseFeeCents: 500, purchaseStart: '09:00', purchaseEnd: '21:00', purchaseStore: '京东便利店',
  secondhandEnabled: false };
const SHARE_STATUS = { pending: '待审核', approved: '已公开', rejected: '未通过', off: '已下架', taken: '已转出' };
const BLANK_PRODUCT = { name: '', spec: '', category: 'fresh', price: '', label: '', tone: 'peach', image: '', featured: false, is_available: false };
const yuan = value => `¥${((value || 0) / 100).toFixed(2)}`;
const moneyToCents = value => Math.round(Number(value) * 100);
function beijingClock(at) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at || Date.now()));
}
function serviceState(enabled, start, end, at) {
  if (!enabled) return { label: '未开启', tone: 'off' };
  const now = beijingClock(at);
  return now >= start && now < end ? { label: '营业中', tone: 'on' } : { label: '当前休息中', tone: 'wait' };
}
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

const PACKAGE_SIZE = { small: '小件', large: '大件' };
const orderKind = o => (o.orderType === 'express' ? 'express' : o.orderType === 'purchase' ? 'purchase' : 'goods');
function orderLines(o) {
  const kind = orderKind(o);
  if (kind === 'express') {
    return (o.packages || []).map((pkg, i) => <div key={`p${i}`}><span>包裹{i + 1}：取件码 {pkg.code} · 尾号 {pkg.phoneLast4} · {PACKAGE_SIZE[pkg.size] || '小件'}</span><strong>{o.station || '—'}</strong></div>);
  }
  if (kind === 'purchase') {
    return (o.purchaseItems || []).map((item, i) => <div key={`i${i}`}><span>{item.name}{item.spec ? `（${item.spec}）` : ''} ×{item.quantity}</span><strong>{o.allowSubstitute ? '可同类替换' : '不接受替换'}</strong></div>);
  }
  return (o.items || []).map((item, i) => <div key={item.id || i}><span>{item.name} ×{item.quantity}</span><strong>{yuan(item.subtotalCents)}</strong></div>);
}
function orderTotals(o) {
  const kind = orderKind(o);
  if (kind === 'express') return <span>代取跑腿费 {yuan(o.serviceFeeCents)}　合计 {yuan(o.totalCents)}</span>;
  if (kind === 'purchase') return <span>商品报价 {yuan(o.quoteCents)} · 代买跑腿费 {yuan(o.serviceFeeCents)}　合计 {yuan(o.totalCents)}</span>;
  return <span>商品 {yuan(o.subtotalCents ?? o.totalCents)} · 配送 {yuan(o.deliveryFeeCents)}　合计 {yuan(o.totalCents)}</span>;
}
function nextAction(o) {
  if (o.orderType === 'purchase') return NEXT_PURCHASE[o.status] || NEXT[o.status];
  return NEXT[o.status];
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
  const [feeInput, setFeeInput] = useState({ min: '0.00', delivery: '0.00', expressBase: '3.00', expressExtra: '1.00', expressLarge: '1.00', purchaseFee: '5.00' });
  const [stations, setStations] = useState([]);
  const [stationDraft, setStationDraft] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [quoteInput, setQuoteInput] = useState({});
  const [shares, setShares] = useState({ list: [], page: 1, hasMore: false });
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
        delivery: ((result.settings?.deliveryFeeCents || 0) / 100).toFixed(2),
        expressBase: ((result.settings?.expressBaseFeeCents ?? 300) / 100).toFixed(2),
        expressExtra: ((result.settings?.expressExtraFeeCents ?? 100) / 100).toFixed(2),
        expressLarge: ((result.settings?.expressLargeFeeCents ?? 100) / 100).toFixed(2),
        purchaseFee: ((result.settings?.purchaseFeeCents ?? 500) / 100).toFixed(2) });
      setStations(Array.isArray(result.settings?.expressStations) ? result.settings.expressStations : []);
      setStationDraft('');
      setAuthorised(true); setError('');
      await loadOrders();
    } catch (e) { setAuthorised(false); setError(e.message || '身份验证失败'); }
    finally { setChecking(false); }
  }
  useEffect(() => { verify(); }, []);
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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
  async function loadShares(page = 1, status = '') {
    setLoading(true);
    try { setShares(await invoke('listShares', { page, status })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function quoteOrder(order) {
    if (busy) return;
    const raw = quoteInput[order._id];
    const quoteCents = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(quoteCents) || quoteCents < 0) { setError('请填写有效的商品报价'); return; }
    setBusy(true); setError('');
    try { await invoke('quoteOrder', { id: order._id, quoteCents }); await loadOrders(orderPage); notify('报价已提交，等待顾客确认'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function reviewShare(item, status) {
    if (busy) return;
    const reason = status === 'approved' ? '' : (window.prompt('填写原因（选填，60字内）') || '');
    setBusy(true); setError('');
    try { await invoke('reviewShare', { id: item._id, status, reason: reason.trim().slice(0, 60) }); await loadShares(shares.page); notify(status === 'approved' ? '已恢复公开' : '已下架'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function changeTab(next) {
    setTab(next); setError(''); setUserDetail(null);
    if (next === 'orders') loadOrders();
    if (next === 'products') loadProducts();
    if (next === 'users') loadUsers(1);
    if (next === 'shares') loadShares(1);
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
      const data = { ...settings, minOrderCents: moneyToCents(feeInput.min), deliveryFeeCents: moneyToCents(feeInput.delivery),
        expressBaseFeeCents: moneyToCents(feeInput.expressBase),         expressExtraFeeCents: moneyToCents(feeInput.expressExtra),
        expressLargeFeeCents: moneyToCents(feeInput.expressLarge),
        purchaseFeeCents: moneyToCents(feeInput.purchaseFee),
        expressStations: stations.slice(0, 10) };
      const result = await invoke('saveSettings', data);
      setSettings({ ...DEFAULTS, ...result });
      setFeeInput({ min: (result.minOrderCents / 100).toFixed(2), delivery: (result.deliveryFeeCents / 100).toFixed(2),
        expressBase: (result.expressBaseFeeCents / 100).toFixed(2),         expressExtra: (result.expressExtraFeeCents / 100).toFixed(2),
        expressLarge: ((result.expressLargeFeeCents ?? 100) / 100).toFixed(2),
        purchaseFee: (result.purchaseFeeCents / 100).toFixed(2) });
      setStations(Array.isArray(result.expressStations) ? result.expressStations : []);
      notify('营业与社区服务设置已保存，小程序将同步生效');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function addStation(e) {
    e.preventDefault();
    const name = stationDraft.trim();
    if (!name) return;
    if (name.length > 20) { setError('快递站点名称请控制在 20 字以内'); return; }
    if (stations.length >= 10) { setError('最多配置 10 个快递站点'); return; }
    if (stations.includes(name)) { setError('该快递站点已存在'); return; }
    setStations([...stations, name]);
    setStationDraft('');
  }
  function removeStation(name) { setStations(stations.filter(item => item !== name)); }
  function moveStation(index, step) {
    const next = index + step;
    if (next < 0 || next >= stations.length) return;
    const list = [...stations];
    [list[index], list[next]] = [list[next], list[index]];
    setStations(list);
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

  const expressWindow = settings.expressFollowShop
    ? { start: settings.businessStart, end: settings.businessEnd }
    : { start: settings.expressStart, end: settings.expressEnd };
  const expressState = serviceState(settings.expressEnabled, expressWindow.start, expressWindow.end, nowTick);
  const purchaseState = serviceState(settings.purchaseEnabled, settings.purchaseStart, settings.purchaseEnd, nowTick);
  return <div className="admin-layout"><aside className="sidebar"><div className="side-brand">口袋便利铺 <span>●</span><small>保利爱尚里 · 商家管理</small></div><nav><button className={tab === 'orders' ? 'nav-active' : ''} onClick={() => changeTab('orders')}>▦　订单管理</button><button className={tab === 'products' ? 'nav-active' : ''} onClick={() => changeTab('products')}>◈　商品管理</button><button className={tab === 'users' ? 'nav-active' : ''} onClick={() => changeTab('users')}>♟　用户管理</button><button className={tab === 'shares' ? 'nav-active' : ''} onClick={() => changeTab('shares')}>♻　闲置管理</button><button className={tab === 'settings' ? 'nav-active' : ''} onClick={() => changeTab('settings')}>⚙　营业设置</button></nav><div className="side-bottom">16 / 17 / 18 栋专送<button onClick={logout}>退出登录</button></div></aside><main className="main-area"><header className="topbar"><span>小区生活，就在楼下</span><div className="topbar-right"><button className={'voice-btn' + (voiceOn ? ' on' : '')} onClick={toggleVoice} title="有新订单时语音播报">语音提醒：{voiceOn ? '开' : '关'}</button><span className="owner-badge">单商家 · 店主</span><button onClick={logout}>退出</button></div></header><div className="main-content">{error && <div className="error-box" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{voiceOn && !audioReady && <div className="error-box" role="status">请在页面任意位置点击一次，以启用新订单语音提醒（浏览器限制）。</div>}{message && <div className="success-box" role="status">{message}</div>}
    {tab === 'orders' && <><div className="heading-row"><div><span className="eyebrow">ORDER CENTER</span><h1>订单管理</h1><p>及时接单、配货与配送，让每份期待准时到家。</p></div><button className="outline-btn" onClick={() => loadOrders(orderPage)}>刷新订单</button></div><div className="stats-row"><div className="stat-card"><span>本页订单</span><strong>{orders.length}</strong><small>共显示最近 20 条 / 页</small></div><div className="stat-card"><span>待处理</span><strong>{orders.filter(o => o.status === 'pending').length}</strong><small>请尽快确认商品</small></div><div className="stat-card"><span>配送中</span><strong>{orders.filter(o => o.status === 'delivering').length}</strong><small>门口交付后确认完成</small></div></div>{loading ? <div className="empty-card">正在加载订单…</div> : orders.length ? <div className="order-list">{orders.map(o => <article className="order-card" key={o._id}><div className="order-top"><div><span className="order-id">订单 #{o._id.slice(-8).toUpperCase()}</span><span className="order-time">{new Date(o.createdAt).toLocaleString('zh-CN')}</span></div><span className={'status status-' + o.status}>{STATUS[o.status] || o.status}</span></div><div className="order-body"><div className="order-products"><div className="order-kind">{orderKind(o) === 'express' ? '快递代取' : orderKind(o) === 'purchase' ? `便利店代买 · ${o.store || '京东便利店'}` : '便利铺现货'}</div>{orderLines(o)}<div className="order-totals">{orderTotals(o)}<strong>合计 {yuan(o.totalCents)}</strong></div></div><div className="order-address"><strong>{o.address || '保利爱尚里'}</strong><span>{o.recipient}　{o.phone}</span><span>送达偏好：{contactText[o.contactPreference] || '请敲门'} · {o.delivery || '尽快送达'}</span>{o.note && <span>备注：{o.note}</span>}</div></div><div className="order-footer"><span>货到付款 · 送达后线下结算</span>{o.orderType === 'purchase' && ['pending', 'quoted'].includes(o.status) && <div className="quote-box"><input type="number" min="0" max="10000" step="0.01" value={quoteInput[o._id] ?? ''} placeholder="商品报价（元）" onChange={e => setQuoteInput({ ...quoteInput, [o._id]: e.target.value })} /><button className="action-btn" disabled={busy} onClick={() => quoteOrder(o)}>提交报价</button></div>}{nextAction(o) && !(o.orderType === 'purchase' && o.status === 'pending') && <button className="action-btn" disabled={busy} onClick={() => advance(o, nextAction(o)[0])}>{nextAction(o)[1]}　→</button>}</div></article>)}</div> : <div className="empty-card">暂无订单，收到新订单后会出现在这里。</div>}<div className="pager"><button className="outline-btn" disabled={orderPage === 1} onClick={() => loadOrders(orderPage - 1)}>上一页</button><span>第 {orderPage} 页</span><button className="outline-btn" disabled={!more} onClick={() => loadOrders(orderPage + 1)}>下一页</button></div></>}
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
    {tab === 'shares' && <><div className="heading-row"><div><span className="eyebrow">NEIGHBOUR SHARES</span><h1>闲置管理</h1><p>居民发布后立即公开，遇到不合适的内容可随时下架。</p></div><button className="outline-btn" onClick={() => loadShares(shares.page)}>刷新</button></div>{loading ? <div className="empty-card">正在加载物品…</div> : shares.list.length ? <div className="order-list">{shares.list.map(item => <article className="order-card" key={item._id}><div className="order-top"><div><span className="order-id">{item.title}</span><span className="order-time">{new Date(item.createdAt).toLocaleString('zh-CN')}</span></div><span className={'status status-' + item.status}>{SHARE_STATUS[item.status] || item.status}</span></div><div className="order-body"><div className="order-products"><div className="order-kind">{item.mode === 'sale' ? `二手转让 ${yuan(item.priceCents)}` : '免费分享'}</div><div key="desc"><span>{item.description}</span><strong>{item.condition}</strong></div><div className="order-totals"><span>交接地点：{item.meetup}</span><strong>{item.images?.length || 0} 张图</strong></div></div><div className="order-address"><strong>{item.rejectReason ? `未通过原因：${item.rejectReason}` : '物品图片'}</strong><span>{item.images?.length ? item.images.join(' , ') : '未上传图片'}</span></div></div><div className="order-footer"><span>{item.status === 'approved' ? '当前对邻居可见' : '当前已下架'}</span>{item.status === 'approved' ? <button className="action-btn" disabled={busy} onClick={() => reviewShare(item, 'off')}>下架</button> : <button className="action-btn" disabled={busy} onClick={() => reviewShare(item, 'approved')}>恢复公开　→</button>}</div></article>)}</div> : <div className="empty-card">还没有邻居发布闲置。</div>}<div className="pager"><button className="outline-btn" disabled={shares.page === 1} onClick={() => loadShares(shares.page - 1)}>上一页</button><span>第 {shares.page} 页</span><button className="outline-btn" disabled={!shares.hasMore} onClick={() => loadShares(shares.page + 1)}>下一页</button></div></>}
    {tab === 'settings' && <><div className="heading-row"><div><span className="eyebrow">STORE SETTINGS</span><h1>营业设置</h1><p>本店只服务保利爱尚里 16、17、18 栋，设置保存后会同步到小程序。</p></div></div><form className="settings-grid" onSubmit={saveSettings}><section className="setting-card"><div className="setting-icon">01</div><h2>营业与配送</h2><p>每日按北京时间执行；关闭营业时，顾客无法提交订单。</p><label className="switch-line"><span><strong>接受新订单</strong><small>手动暂停接单时关闭</small></span><input type="checkbox" checked={!!settings.ordersEnabled} onChange={e => setSettings({ ...settings, ordersEnabled: e.target.checked })} /></label><div className="form-grid"><label>营业开始<input type="time" value={settings.businessStart} onChange={e => setSettings({ ...settings, businessStart: e.target.value })} required /></label><label>营业结束<input type="time" value={settings.businessEnd} onChange={e => setSettings({ ...settings, businessEnd: e.target.value })} required /></label><label>配送开始<input type="time" value={settings.deliveryStart} onChange={e => setSettings({ ...settings, deliveryStart: e.target.value })} required /></label><label>配送结束<input type="time" value={settings.deliveryEnd} onChange={e => setSettings({ ...settings, deliveryEnd: e.target.value })} required /></label></div><p className="fine-print">仅支持同日时段；营业与配送时段重合时，顾客才可下单。</p></section><section className="setting-card"><div className="setting-icon">02</div><h2>订单金额</h2><p>金额以元计；货到后线下结算，店铺不处理线上支付。</p><div className="form-grid"><label>最低起送金额（元）<input type="number" min="0" max="10000" step="0.01" value={feeInput.min} onChange={e => setFeeInput({ ...feeInput, min: e.target.value })} required /></label><label>每单配送费（元）<input type="number" min="0" max="100" step="0.01" value={feeInput.delivery} onChange={e => setFeeInput({ ...feeInput, delivery: e.target.value })} required /></label></div><p className="fine-print">起送金额按商品小计计算，不含配送费。</p><label className="owner-field">小程序店主身份标识（可选）<input value={settings.ownerOpenid || ''} onChange={e => setSettings({ ...settings, ownerOpenid: e.target.value })} placeholder="绑定后可在小程序中处理订单" /></label></section><section className="setting-card wide"><div className="setting-icon">03</div><h2>店主微信</h2><p>填写后，顾客在小程序「订单」页顶部会看到“添加店主微信方便沟通”的提示，点击可一键复制。</p><label className="owner-field">店主微信号<input value={settings.ownerWechat || ''} maxLength={40} onChange={e => setSettings({ ...settings, ownerWechat: e.target.value.trim() })} placeholder="例如 my_shop_wx" /></label><p className="fine-print">{settings.ownerWechat ? `小程序将显示：订单有疑问？添加店主微信 ${settings.ownerWechat} 方便沟通` : '当前未填写，小程序订单页不会显示该提示。'}</p></section>
      <section className="setting-card"><div className="setting-icon">04</div><h2>快递代取 <span className={'live-badge ' + expressState.tone}>{expressState.label}</span></h2><p>开启后，顾客在小程序选择快递站点、粘贴短信自动识别取件码后下单代取。</p><label className="switch-line"><span><strong>开启快递代取</strong><small>关闭时顾客无法提交代取订单</small></span><input type="checkbox" checked={!!settings.expressEnabled} onChange={e => setSettings({ ...settings, expressEnabled: e.target.checked })} /></label><label className="switch-line"><span><strong>跟随店铺营业时间</strong><small>开启后，代取与店铺同时营业、同时打烊（{settings.businessStart}—{settings.businessEnd}）</small></span><input type="checkbox" checked={!!settings.expressFollowShop} onChange={e => setSettings({ ...settings, expressFollowShop: e.target.checked })} /></label><div className="form-grid"><label>基础跑腿费（元，含首件）<input type="number" min="0" max="100" step="0.01" value={feeInput.expressBase} onChange={e => setFeeInput({ ...feeInput, expressBase: e.target.value })} required /></label><label>每多一件加价（元）<input type="number" min="0" max="100" step="0.01" value={feeInput.expressExtra} onChange={e => setFeeInput({ ...feeInput, expressExtra: e.target.value })} required /></label><label>每个大件加价（元）<input type="number" min="0" max="100" step="0.01" value={feeInput.expressLarge} onChange={e => setFeeInput({ ...feeInput, expressLarge: e.target.value })} required /></label><label>服务开始<input type="time" value={settings.expressStart} onChange={e => setSettings({ ...settings, expressStart: e.target.value })} required /></label><label>服务结束<input type="time" value={settings.expressEnd} onChange={e => setSettings({ ...settings, expressEnd: e.target.value })} required /></label></div><div className="station-manager"><div className="station-manager-head"><span>快递站点</span><strong>{stations.length} / 10</strong></div><p className="station-hint">顾客只能从下方站点中选择，不能自行输入；建议写成「驿站名（位置）」，例如「菜鸟驿站（16栋架空层）」。添加、删除或调整顺序后，需点击底部「保存营业设置」才会同步到小程序。</p><ul className="station-list">{stations.map((name, i) => <li key={name + i}><span className="station-index">{i + 1}</span><span className="station-name">{name}</span><span className="station-ops"><button type="button" className="mini-btn" onClick={() => moveStation(i, -1)} disabled={i === 0}>↑</button><button type="button" className="mini-btn" onClick={() => moveStation(i, 1)} disabled={i === stations.length - 1}>↓</button><button type="button" className="mini-btn danger" onClick={() => removeStation(name)}>删除</button></span></li>)}</ul>{!stations.length && <p className="station-empty">还没有配置站点，开启代取后顾客也无法下单。</p>}<div className="station-add"><input value={stationDraft} maxLength={20} placeholder="如：菜鸟驿站（16栋架空层）" onChange={e => setStationDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStation(e); } }} /><button type="button" className="main-btn compact" onClick={addStation} disabled={!stationDraft.trim() || stations.length >= 10}>添加站点</button></div></div><p className="fine-print">费用 = 基础跑腿费（含首件）＋ 每多一件加价 ＋ 每个大件加价。</p></section>
      <section className="setting-card"><div className="setting-icon">05</div><h2>便利店代买 <span className={'live-badge ' + purchaseState.tone}>{purchaseState.label}</span></h2><p>非京东官方服务；顾客提交清单，店主报价并确认后代买。</p><label className="switch-line"><span><strong>开启便利店代买</strong><small>关闭时顾客无法提交代买订单</small></span><input type="checkbox" checked={!!settings.purchaseEnabled} onChange={e => setSettings({ ...settings, purchaseEnabled: e.target.checked })} /></label><div className="form-grid"><label>每单跑腿费（元）<input type="number" min="0" max="100" step="0.01" value={feeInput.purchaseFee} onChange={e => setFeeInput({ ...feeInput, purchaseFee: e.target.value })} required /></label><label>代买门店名称<input value={settings.purchaseStore || ''} maxLength={20} onChange={e => setSettings({ ...settings, purchaseStore: e.target.value })} placeholder="京东便利店" /></label><label>服务开始<input type="time" value={settings.purchaseStart} onChange={e => setSettings({ ...settings, purchaseStart: e.target.value })} required /></label><label>服务结束<input type="time" value={settings.purchaseEnd} onChange={e => setSettings({ ...settings, purchaseEnd: e.target.value })} required /></label></div><p className="fine-print">商品金额由店主按实际购买情况报价，顾客确认后开始代买；跑腿费与商品款分开展示。</p></section>
      <section className="setting-card wide"><div className="setting-icon">06</div><h2>二手物品分享</h2><p>居民可发布闲置，发布后立即公开；免费分享不收取费用。</p><label className="switch-line"><span><strong>开启二手分享</strong><small>关闭后小程序不再展示发布入口</small></span><input type="checkbox" checked={!!settings.secondhandEnabled} onChange={e => setSettings({ ...settings, secondhandEnabled: e.target.checked })} /></label><p className="fine-print">物品发布即公开，可在闲置管理中下架；发布与交接请注意隐私与人身安全。</p></section>
      <div className="save-row"><button className="main-btn compact" disabled={busy}>{busy ? '保存中…' : '保存营业设置'}</button></div></form></>}
    {editor && <div className="modal-backdrop" onClick={() => setEditor(null)}><form className="modal" onClick={e => e.stopPropagation()} onSubmit={saveProduct}><div className="modal-head"><h2>{editor.id ? '编辑商品' : '上架新商品'}</h2><button type="button" className="text-btn" onClick={() => setEditor(null)}>关闭</button></div><div className="form-grid"><label>商品名称<input maxLength="40" value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} required /></label><label>规格说明<input maxLength="60" value={editor.spec} onChange={e => setEditor({ ...editor, spec: e.target.value })} required /></label><label>分类<select value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })}>{Object.entries(CATEGORIES).map(([key, val]) => <option value={key} key={key}>{val}</option>)}</select></label><label>价格（元）<input type="number" min="0.01" max="10000" step="0.01" value={editor.price} onChange={e => setEditor({ ...editor, price: e.target.value })} required /></label><label>展示标签<input maxLength="12" value={editor.label || ''} onChange={e => setEditor({ ...editor, label: e.target.value })} /></label><label>商品图片（预设）<select value={PRODUCT_IMAGES[editor.image] ? editor.image : ''} onChange={e => setEditor({ ...editor, image: e.target.value })}><option value="">{editor.image && !PRODUCT_IMAGES[editor.image] ? '使用已上传图片' : '暂无图片'}</option>{Object.entries(PRODUCT_IMAGES).map(([path, label]) => <option value={path} key={path}>{label}</option>)}</select></label><div className="upload-field"><span>上传商品图片</span><div className="upload-box"><div className="upload-preview">{editor.image ? <ProductImage src={editor.image} alt="商品图片预览" fallback="加载中" /> : '暂无'}</div><div className="upload-actions"><label className="outline-btn upload-btn">{uploading ? '上传中…' : '选择图片'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={pickImage} /></label>{editor.image && <button type="button" className="text-btn" onClick={() => setEditor({ ...editor, image: '' })}>移除图片</button>}<small>支持 JPG / PNG / WebP，不超过 3MB</small></div></div></div><label>展示色系<select value={editor.tone || 'peach'} onChange={e => setEditor({ ...editor, tone: e.target.value })}>{['peach','cocoa','butter','sage','rose','mango','lemon','oat'].map(t => <option key={t} value={t}>{t}</option>)}</select></label></div><div className="check-row"><label><input type="checkbox" checked={!!editor.is_available} onChange={e => setEditor({ ...editor, is_available: e.target.checked })} />上架销售</label><label><input type="checkbox" checked={!!editor.featured} onChange={e => setEditor({ ...editor, featured: e.target.checked })} />首页推荐</label></div><button className="main-btn compact" disabled={busy || uploading}>{busy ? '保存中…' : '保存商品'}</button></form></div>}</div></main></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
