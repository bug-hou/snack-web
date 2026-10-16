import Icon from './Icon';
import { redirect } from '../lib/router';

export const TABS = [
  { path: '/', label: '社区', icon: 'home' },
  { path: '/forum', label: '广场', icon: 'forum' },
  { path: '/profile', label: '我的', icon: 'user' }
];

/**
 * 大标题页头：不再提供返回箭头。
 * 返回交给系统手势 / 浏览器返回 / 常驻底部 TabBar，避免三重返回入口。
 */
export function PageHeader({ title, sub, right }) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        <h1 className="page-head-title">{title}</h1>
        {sub ? <p className="page-head-sub">{sub}</p> : null}
      </div>
      {right ? <div className="page-head-right">{right}</div> : null}
    </header>
  );
}

/** 底部主导航：所有页面常驻，二级页靠它或系统返回退出 */
export function TabBar({ path }) {
  return (
    <nav className="tabbar dock" aria-label="主导航">
      <div className="tabbar-brand">
        <span className="brand-mark">里</span>
        <span className="brand-name">爱尚里生活</span>
      </div>
      <div className="tabbar-links">
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
      </div>
    </nav>
  );
}
