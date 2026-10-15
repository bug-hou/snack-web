import { useCallback, useEffect, useState } from 'react';
import UiHost from './components/UiHost';
import { TabBar } from './components/Layout';
import { Banner } from './components/Bits';
import { useRoute, parsePath, redirect } from './lib/router';
import { CONFIG_ERROR, currentUid, ensureLogin, errorText, signInWithPassword } from './lib/cloud';
import Home from './pages/Home';
import Forum from './pages/Forum';
import ForumPost from './pages/ForumPost';
import ForumDetail from './pages/ForumDetail';
import Profile from './pages/Profile';
import ProfileEdit from './pages/ProfileEdit';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import Address from './pages/Address';
import Service from './pages/Service';
import Errand from './pages/Errand';
import Shares from './pages/Shares';
import ShareForm from './pages/ShareForm';
import ShareDetail from './pages/ShareDetail';

const TAB_PATHS = ['/', '/forum', '/profile'];

function ConfigScreen() {
  return (
    <div className="screen screen-padded">
      <div className="empty-state">
        <div className="empty-art"><span className="empty-pack">SETUP</span></div>
        <div className="empty-heading">还未连接云服务</div>
        <div className="empty-copy">{CONFIG_ERROR}</div>
      </div>
    </div>
  );
}

function LoginScreen({ error, onAnonymous, onPassword, onBrowse }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  async function submitPassword() {
    if (busy || !username.trim() || !password) return;
    setBusy(true); setFail('');
    try {
      await onPassword(username.trim(), password);
    } catch (e) {
      setFail(errorText(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="screen screen-padded login-screen">
      <div className="login-hero">
        <span className="login-mark">里</span>
        <div>
          <div className="login-title">爱尚里生活</div>
          <div className="login-sub">家门口的小事，一起办好</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">开始使用</div>
        <p className="login-copy">
          网页版使用云开发匿名登录，不会读取微信身份，也不会要求手机号。
          换个浏览器会被当成新邻居，登录后可在「我的」里设置昵称。
        </p>
        <button type="button" className="primary-action" onClick={onAnonymous}>一键进入　→</button>
        <button type="button" className="ghost-action" onClick={onBrowse}>先随便逛逛</button>
      </div>

      <div className="card">
        <div className="card-title">用账号登录</div>
        <input
          className="input"
          value={username}
          onChange={event => setUsername(event.target.value)}
          placeholder="用户名"
          autoComplete="username"
        />
        <input
          className="input"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="密码"
          autoComplete="current-password"
        />
        {fail ? <div className="error-line">{fail}</div> : null}
        <button type="button" className="primary-action" onClick={submitPassword} disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </div>

      {error ? <Banner tone="peach">{error}</Banner> : null}
      <div className="foot-note">若「一键进入」失败，请到云开发控制台开启「匿名登录」，或改用账号登录。</div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="screen screen-padded">
      <div className="empty-state">
        <div className="empty-art"><span className="empty-pack">404</span></div>
        <div className="empty-heading">页面走丢了</div>
        <div className="empty-copy">这个地址没有对应的页面，回社区首页看看吧。</div>
        <button type="button" className="primary-action" onClick={() => redirect('/')}>回社区首页　→</button>
      </div>
    </div>
  );
}

function resolvePage(segments, query) {
  const [first, second] = segments;
  if (!first) return { element: <Home />, title: '' };
  switch (first) {
    case 'forum':
      if (!second) return { element: <Forum />, title: '' };
      if (second === 'new') return { element: <ForumPost />, title: '发布帖子' };
      return { element: <ForumDetail id={second} />, title: '帖子详情' };
    case 'profile':
      if (second === 'edit') return { element: <ProfileEdit />, title: '个人资料' };
      return { element: <Profile />, title: '' };
    case 'cart':
      return { element: <Cart />, title: '需求清单' };
    case 'checkout':
      return { element: <Checkout productId={query.productId || ''} />, title: '确认需求' };
    case 'orders':
      return { element: <Orders />, title: '我的需求' };
    case 'address':
      return { element: <Address from={query.from || ''} />, title: '收货地址' };
    case 'service':
      return { element: <Service type={second || 'express'} />, title: '社区服务' };
    case 'errand':
      return { element: <Errand type={second === 'purchase' ? 'purchase' : 'express'} />, title: second === 'purchase' ? '便利店代买' : '快递代取' };
    case 'shares':
      if (!second) return { element: <Shares />, title: '邻里闲置' };
      if (second === 'new') return { element: <ShareForm />, title: '发布闲置' };
      return { element: <ShareDetail id={second} />, title: '物品详情' };
    default:
      return { element: <NotFound />, title: '' };
  }
}

export default function App() {
  const path = useRoute();
  const [session, setSession] = useState({ status: 'loading', uid: '' });
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const uid = await currentUid();
      if (uid) {
        if (alive) setSession({ status: 'ready', uid });
        return;
      }
      const ok = await ensureLogin();
      if (!alive) return;
      if (ok) setSession({ status: 'ready', uid: await currentUid() });
      else setSession({ status: 'guest', uid: '' });
    })();
    return () => { alive = false; };
  }, []);

  const retryAnonymous = useCallback(async () => {
    setLoginError('');
    const ok = await ensureLogin();
    if (ok) setSession({ status: 'ready', uid: await currentUid() });
    else setLoginError('匿名登录未开启，请在云开发控制台 → 环境 → 登录授权中开启「匿名登录」，或改用账号登录。');
  }, []);

  const loginWithPassword = useCallback(async (username, password) => {
    const uid = await signInWithPassword(username, password);
    setSession({ status: 'ready', uid });
  }, []);

  if (CONFIG_ERROR) {
    return (
      <div className="app">
        <ConfigScreen />
        <UiHost />
      </div>
    );
  }

  if (session.status === 'loading') {
    return (
      <div className="app">
        <div className="screen screen-padded boot-screen">
          <div className="boot-mark">里</div>
          <div className="boot-text">正在进入爱尚里…</div>
        </div>
        <UiHost />
      </div>
    );
  }

  if (session.status === 'guest') {
    return (
      <div className="app">
        <LoginScreen
          error={loginError}
          onAnonymous={retryAnonymous}
          onPassword={loginWithPassword}
          onBrowse={() => setSession({ status: 'browse', uid: '' })}
        />
        <UiHost />
      </div>
    );
  }

  const { segments, query } = parsePath(path);
  const { element } = resolvePage(segments, query);
  const isTab = TAB_PATHS.includes(path);

  return (
    <div className="app">
      {session.status === 'browse' ? (
        <div className="guest-bar">
          <span>浏览模式：登记需求、发布内容需要先登录</span>
          <button type="button" onClick={retryAnonymous}>登录</button>
        </div>
      ) : null}
      {element}
      {isTab ? <TabBar path={path} /> : null}
      <UiHost />
    </div>
  );
}
