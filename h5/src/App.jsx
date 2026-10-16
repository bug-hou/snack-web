import { useCallback, useEffect, useState } from 'react';
import UiHost from './components/UiHost';
import { TabBar } from './components/Layout';
import { Banner } from './components/Bits';
import { useRoute, parsePath, redirect } from './lib/router';
import { CONFIG_ERROR, currentUid, errorText, register, signInWithPassword, signOut } from './lib/cloud';
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
import Errand from './pages/Errand';
import Shares from './pages/Shares';
import ShareForm from './pages/ShareForm';
import ShareDetail from './pages/ShareDetail';

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

function LoginScreen({ error, onLogin, onRegister, onBrowse }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickName, setNickName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  const isRegister = mode === 'register';

  function switchMode(next) {
    setMode(next);
    setFail('');
  }

  async function submit() {
    if (busy || !username.trim() || !password) return;
    setBusy(true); setFail('');
    try {
      if (isRegister) await onRegister(username.trim(), password, nickName.trim());
      else await onLogin(username.trim(), password);
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
        <div className="card-title">{isRegister ? '注册新账号' : '登录'}</div>
        <p className="login-copy">
          用用户名和密码登录，不读取微信身份，也不需要手机号。
          {isRegister ? '用户名 3-20 位字母、数字或下划线，密码至少 8 位。' : '换设备后用同一账号登录即可继续。'}
        </p>
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
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />
        {isRegister ? (
          <input
            className="input"
            value={nickName}
            onChange={event => setNickName(event.target.value)}
            placeholder="昵称（选填，至少 2 个字）"
            autoComplete="nickname"
          />
        ) : null}
        {fail ? <div className="error-line">{fail}</div> : null}
        <button type="button" className="primary-action" onClick={submit} disabled={busy}>
          {busy ? (isRegister ? '注册中…' : '登录中…') : (isRegister ? '注册并进入' : '登录')}
        </button>
        <button type="button" className="ghost-action" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
          {isRegister ? '已有账号，去登录' : '还没有账号，去注册'}
        </button>
        <button type="button" className="ghost-action" onClick={onBrowse}>先随便逛逛</button>
      </div>

      {error ? <Banner tone="peach">{error}</Banner> : null}
      <div className="foot-note">登录后可登记需求、发布闲置和参与邻里广场；未登录只能浏览。</div>
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

function resolvePage(segments, query, onLogout) {
  const [first, second] = segments;
  if (!first) return { element: <Home />, title: '' };
  switch (first) {
    case 'forum':
      if (!second) return { element: <Forum />, title: '' };
      if (second === 'new') return { element: <ForumPost />, title: '发布帖子' };
      return { element: <ForumDetail id={second} />, title: '帖子详情' };
    case 'profile':
      if (second === 'edit') return { element: <ProfileEdit />, title: '个人资料' };
      return { element: <Profile onLogout={onLogout} />, title: '' };
    case 'cart':
      return { element: <Cart />, title: '需求清单' };
    case 'checkout':
      return { element: <Checkout productId={query.productId || ''} />, title: '确认需求' };
    case 'orders':
      return { element: <Orders />, title: '我的需求' };
    case 'address':
      return { element: <Address from={query.from || ''} />, title: '收货地址' };
    case 'service':
      // 旧的社区服务介绍页已下线：直接落到真实的服务登记页
      if (second === 'secondhand') return { element: <Shares />, title: '' };
      return { element: <Errand type={second === 'purchase' ? 'purchase' : 'express'} />, title: '' };
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
      if (alive) setSession(uid ? { status: 'ready', uid } : { status: 'guest', uid: '' });
    })();
    return () => { alive = false; };
  }, []);

  const loginWithPassword = useCallback(async (username, password) => {
    const uid = await signInWithPassword(username, password);
    setSession({ status: 'ready', uid });
  }, []);

  const registerAccount = useCallback(async (username, password, nickName) => {
    const uid = await register(username, password, nickName);
    setSession({ status: 'ready', uid });
  }, []);

  const backToLogin = useCallback(() => setSession({ status: 'guest', uid: '' }), []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setSession({ status: 'guest', uid: '' });
      redirect('/');
    }
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
          onLogin={loginWithPassword}
          onRegister={registerAccount}
          onBrowse={() => setSession({ status: 'browse', uid: '' })}
        />
        <UiHost />
      </div>
    );
  }

  const { segments, query } = parsePath(path);
  const { element } = resolvePage(segments, query, logout);

  return (
    <div className="app">
      {session.status === 'browse' ? (
        <div className="guest-bar">
          <span>浏览模式：登记需求、发布内容需要先登录</span>
          <button type="button" onClick={backToLogin}>登录</button>
        </div>
      ) : null}
      {element}
      {/* 底部导航常驻所有页面：二级页不再需要返回箭头，靠它或系统返回退出 */}
      <TabBar path={path} />
      <UiHost />
    </div>
  );
}
