import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { PageHeader } from '../components/Layout';
import { navigate, redirect } from '../lib/router';
import { peekProfile, loadProfile } from '../lib/shop';
import { useCloudImages } from '../lib/useCloudImages';
import { confirm } from '../lib/ui';
import {
  canPromptInstall, isInstalled, isIos, promptInstall, subscribeInstall
} from '../lib/pwa';

const ROWS = [
  { id: 'orders', icon: 'clipboard', title: '我的需求', sub: '查看处理进度与历史记录', path: '/orders' },
  { id: 'address', icon: 'pin', title: '我的收货地址', sub: '管理楼栋、门牌号与联系电话', path: '/address' },
  { id: 'shares', icon: 'repeat', title: '我的闲置发布', sub: '二手转让与免费分享', path: '/shares' },
  { id: 'forum', icon: 'forum', title: '邻里广场', sub: '闲聊 · 互助求助 · 失物招领', path: '/forum' }
];

export default function Profile({ onLogout }) {
  const [profile, setProfile] = useState(() => peekProfile());
  const [installable, setInstallable] = useState(() => canPromptInstall() || isIos());
  const [installed, setInstalled] = useState(() => isInstalled());
  const resolve = useCloudImages([profile.avatarUrl]);

  useEffect(() => subscribeInstall(() => {
    setInstallable(canPromptInstall() || isIos());
    setInstalled(isInstalled());
  }), []);

  async function install() {
    const shown = await promptInstall();
    if (shown) return;
    await confirm({
      title: '把爱尚里添加到桌面',
      content: isIos()
        ? '在 Safari 里点底部「分享」，选择「添加到主屏幕」，之后就能像 App 一样从桌面打开。'
        : '用浏览器菜单里的「添加到主屏幕」或「安装应用」即可；添加后会在桌面生成图标，点开就是全屏的社区页面。',
      confirmText: '我知道了',
      showCancel: false
    });
  }

  useEffect(() => {
    let alive = true;
    loadProfile().then(next => { if (alive) setProfile(next); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const nickName = profile.nickName || '';
  const displayName = nickName || '爱尚里邻居';
  const initial = nickName ? nickName.slice(0, 1) : '里';
  const avatarUrl = resolve(profile.avatarUrl);

  return (
    <div className="screen screen-tabbed profile-page">
      <PageHeader title="我的" sub="保利爱尚里 · 16 / 17 / 18 栋" />

      <section className="profile-hero">
        <span className="profile-avatar">
          {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : initial}
        </span>
        <div className="profile-hero-copy">
          <div className="profile-hero-title">{displayName}</div>
          <div className="profile-hero-sub">{nickName ? '点击编辑可修改头像与昵称' : '还没有设置昵称'}</div>
        </div>
        <button type="button" className="profile-edit" onClick={() => navigate('/profile/edit')}>编辑</button>
      </section>

      <section className="group">
        <div className="group-title">我的</div>
        {ROWS.map(row => (
          <button key={row.id} type="button" className="row-item" onClick={() => redirect(row.path)}>
            <span className="row-ico"><Icon name={row.icon} size={16} /></span>
            <span className="row-copy">
              <span className="row-title">{row.title}</span>
              <span className="row-sub">{row.sub}</span>
            </span>
            <span className="row-extra">›</span>
          </button>
        ))}
        {installable && !installed ? (
          <button type="button" className="row-item" onClick={install}>
            <span className="row-ico"><Icon name="home" size={16} /></span>
            <span className="row-copy">
              <span className="row-title">添加到手机桌面</span>
              <span className="row-sub">像 App 一样从桌面打开，不用再输网址</span>
            </span>
            <span className="row-extra">›</span>
          </button>
        ) : null}
      </section>

      <button type="button" className="logout-btn" onClick={onLogout}>退出登录</button>

      <div className="profile-note">
        本页仅提供社区便民信息展示与需求登记，不提供在线下单、在线支付与交易担保；实际商品、费用与送达以线下当面确认为准。
      </div>
    </div>
  );
}
