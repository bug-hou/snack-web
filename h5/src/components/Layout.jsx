import Icon from './Icon';
import { back, redirect } from '../lib/router';

export const TABS = [
  { path: '/', label: '社区', icon: 'home' },
  { path: '/forum', label: '广场', icon: 'forum' },
  { path: '/profile', label: '我的', icon: 'user' }
];

export function NavBar({ title, onBack, right, fallback = '/' }) {
  return (
    <header className="navbar">
      <button type="button" className="navbar-back" onClick={() => (onBack ? onBack() : back(fallback))} aria-label="返回">
        <Icon name="back" size={22} />
      </button>
      <h1 className="navbar-title">{title}</h1>
      <div className="navbar-right">{right}</div>
    </header>
  );
}

export function TabBar({ path }) {
  return (
    <nav className="tabbar dock" aria-label="主导航">
      {TABS.map(tab => {
        const active = path === tab.path;
        return (
          <button
            key={tab.path}
            type="button"
            className={`tabbar-item ${active ? 'active' : ''}`}
            onClick={() => redirect(tab.path)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Screen({ children, withTabBar = false, className = '' }) {
  return (
    <div className={`screen ${withTabBar ? 'screen-tabbed' : ''} ${className}`.trim()}>
      {children}
    </div>
  );
}
