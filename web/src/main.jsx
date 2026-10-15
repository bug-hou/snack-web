import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, invoke, authErrorMessage } from './cloud';
import { ToastProvider, useToast, Icon, Chip, Alert } from './ui';
import { DEFAULT_SETTINGS, beijingClock } from './utils';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Users from './pages/Users';
import Shares from './pages/Shares';
import Posts from './pages/Posts';
import Settings from './pages/Settings';
import './style.css';

const NAV = [
  { key: 'dashboard', label: '经营概览', icon: 'dashboard' },
  { key: 'orders', label: '订单管理', icon: 'orders' },
  { key: 'products', label: '商品管理', icon: 'products' },
  { key: 'users', label: '用户管理', icon: 'users' },
  { key: 'shares', label: '闲置管理', icon: 'shares' },
  { key: 'posts', label: '广场管理', icon: 'posts' },
  { key: 'settings', label: '营业设置', icon: 'settings' }
];
const NAV_TITLE = Object.fromEntries(NAV.map(item => [item.key, item.label]));
const POLL_MS = 15000;

let audioCtx = null;
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.25].forEach(offset => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + offset + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + offset);
      osc.stop(audioCtx.currentTime + offset + 0.2);
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
      u.lang = 'zh-CN';
      window.speechSynthesis.speak(u);
    }
  } catch (e) { /* 忽略 */ }
}

function Login({ session, uid, error, onLogout }) {
  const [username, setUsername] = useState(() => localStorage.getItem('snackAdminUser') || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true); setFail('');
    try {
      await auth.signIn({ username: username.trim(), password });
      localStorage.setItem('snackAdminUser', username.trim());
      setPassword('');
      window.location.reload();
    } catch (err) {
      setFail(authErrorMessage(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="brand"><i>口</i>口袋便利铺 · 商家管理</div>
        <h1>把好商品<br />送到家门口。</h1>
        <p>一个后台搞定订单、商品、邻居闲置与社区服务，顾客在小程序下单，你在网页端处理。</p>
        <div className="tags">
          <span>订单流转</span><span>商品上架</span><span>快递代取</span><span>便利店代买</span><span>邻里闲置</span>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <span className="eyebrow">POCKET SNACKS · ADMIN</span>
          <h2>{session ? '尚未开通店主权限' : '欢迎回来'}</h2>
          <p>{session ? '当前账号已登录，但还不是这家小店的店主。请把下面的 UID 配置到云函数环境变量。' : '登录后可管理订单、商品与营业设置。'}</p>

          {session ? (
            <>
              <div className="uid-box">
                当前账号 UID（复制到云函数 snackAdmin 的环境变量 SHOP_ADMIN_UID）
                <code>{uid || '请到 CloudBase 控制台查看'}</code>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <button className="btn btn-primary btn-block" onClick={onLogout}>退出当前账号</button>
              </div>
            </>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <div className="field">
                <label>商家账号</label>
                <input className="input" autoComplete="username" value={username} placeholder="CloudBase 用户名"
                  onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="field">
                <label>登录密码</label>
                <input className="input" type="password" autoComplete="current-password" value={password} placeholder="登录密码"
                  onChange={e => setPassword(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy || !username.trim() || !password}>
                {busy ? '正在登录…' : '登录商家端'}
              </button>
            </form>
          )}

          {error && <div style={{ marginTop: 14 }}><Alert tone="error">{error}</Alert></div>}
          {fail && <div style={{ marginTop: 14 }}><Alert tone="error">{fail}</Alert></div>}
          <div className="login-foot">仅店主本人可访问 · 请使用安全密码</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const toast = useToast();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [uid, setUid] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [stats, setStats] = useState(null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('voiceAlert') !== 'off');
  const [audioReady, setAudioReady] = useState(() => !!(navigator.userActivation && navigator.userActivation.hasBeenActive));
  const voiceRef = useRef(voiceOn);
  const refreshRef = useRef(null);
  voiceRef.current = voiceOn;

  const refreshStats = useCallback(async () => {
    try {
      const data = await invoke('getStats');
      setStats(data);
    } catch (e) { /* 统计失败不打扰用户 */ }
  }, []);

  const verify = useCallback(async () => {
    setChecking(true);
    setError('');
    let loginUid = '';
    try {
      const state = await auth.getLoginState();
      const user = state && state.user;
      loginUid = (user && (user.uid || user.sub)) || '';
    } catch (e) { /* 未登录时忽略 */ }
    try {
      const data = await invoke('getDashboard');
      setUid(loginUid);
      setSession(true);
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
      setStats(data.stats || null);
      setAuthorised(true);
    } catch (e) {
      const message = e && e.message ? e.message : '身份验证失败';
      if (/请先登录/.test(message)) { setSession(false); setUid(''); }
      else { setSession(true); setUid(loginUid); setError(message); }
      setAuthorised(false);
    } finally {      setChecking(false);
    }
  }, []);

  useEffect(() => { verify(); }, [verify]);

  useEffect(() => {
    if (audioReady) return undefined;
    const unlock = () => setAudioReady(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audioReady]);

  // 新订单轮询：只查第一页，用待处理订单的 id 变化判断是否有新单
  useEffect(() => {
    if (!authorised) return undefined;
    let stopped = false;
    let known = null;
    async function poll() {
      try {
        const data = await invoke('getOrders', { page: 1 });
        if (stopped) return;
        const ids = new Set((data.list || []).filter(o => o.status === 'pending').map(o => o._id));
        if (known === null) { known = ids; return; }
        const fresh = [...ids].filter(id => !known.has(id));
        known = ids;
        if (!fresh.length) return;
        if (voiceRef.current) speak(fresh.length > 1 ? `您有${fresh.length}个新订单，请及时处理` : '您有新订单，请及时处理');
        toast(`收到 ${fresh.length} 个新订单`, 'success');
        refreshStats();
        if (refreshRef.current) refreshRef.current();
      } catch (e) { /* 轮询失败静默，下次重试 */ }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [authorised, toast, refreshStats]);

  async function logout() {
    try { await auth.signOut(); } catch (e) { /* 忽略，仍然清理本地状态 */ }
    setSession(false); setAuthorised(false); setUid(''); setStats(null); setError('');
  }

  const onDataChanged = useCallback(() => { refreshStats(); }, [refreshStats]);
  const registerRefresh = useCallback(fn => { refreshRef.current = fn; }, []);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
        <div className="row"><span className="spinner" />正在进入商家管理…</div>
      </div>
    );
  }
  if (!authorised) return <Login session={session} uid={uid} error={error} onLogout={logout} />;

  const pending = (stats && stats.pendingCount) || 0;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">口</span>
          <span className="brand-text">
            <strong>口袋便利铺</strong>
            <span>保利爱尚里 · 商家管理</span>
          </span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button key={item.key} className={`nav-item${tab === item.key ? ' active' : ''}`} onClick={() => setTab(item.key)}>
              <Icon name={item.icon} size={16} className="nav-ico" />
              {item.label}
              {item.key === 'orders' && pending > 0 && <span className="nav-badge">{pending > 99 ? '99+' : pending}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <small>16 / 17 / 18 栋专送 · 北京时间 {beijingClock()}</small>
          <button onClick={logout}><Icon name="logout" size={13} /> 退出登录</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {NAV_TITLE[tab]}
            <small>{uid ? `店主账号 ${uid.slice(0, 6)}…${uid.slice(-4)}` : '单商家 · 店主'}</small>
          </div>
          <div className="topbar-right">
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              localStorage.setItem('voiceAlert', next ? 'on' : 'off');
              if (next) speak('语音提醒已开启', 1);
            }}>
              <Icon name="bell" size={14} />语音提醒：{voiceOn ? '开' : '关'}
            </button>
            <Chip tone="green">已授权</Chip>
            <button className="btn btn-ghost btn-sm" onClick={logout}><Icon name="logout" size={14} />退出</button>
          </div>
        </header>

        <div className="content">
          {voiceOn && !audioReady && (
            <Alert tone="info">请在页面任意位置点击一次，以启用新订单语音提醒（浏览器限制）。</Alert>
          )}
          {tab === 'dashboard' && <Dashboard settings={settings} stats={stats} onNavigate={setTab} />}
          {tab === 'orders' && <Orders onChanged={onDataChanged} registerRefresh={registerRefresh} />}
          {tab === 'products' && <Products onChanged={onDataChanged} />}
          {tab === 'users' && <Users />}
          {tab === 'shares' && <Shares onChanged={onDataChanged} />}
          {tab === 'posts' && <Posts onChanged={onDataChanged} />}
          {tab === 'settings' && <Settings settings={settings} onSaved={setSettings} />}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ToastProvider><App /></ToastProvider>
);
