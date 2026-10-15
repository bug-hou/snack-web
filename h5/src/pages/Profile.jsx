import { useEffect, useState } from 'react';
import { navigate, redirect } from '../lib/router';
import { invoke } from '../lib/cloud';
import { peekProfile, loadProfile } from '../lib/shop';
import { useCloudImages } from '../lib/useCloudImages';
import { CONTACT_LABELS } from '../lib/data';

export default function Profile() {
  const [profile, setProfile] = useState(() => peekProfile());
  const [context, setContext] = useState({});
  const resolve = useCloudImages([profile.avatarUrl]);

  useEffect(() => {
    let alive = true;
    loadProfile().then(next => { if (alive) setProfile(next); }).catch(() => {});
    invoke('getContext').then(next => { if (alive) setContext(next || {}); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const nickName = profile.nickName || '';
  const displayName = nickName || '爱尚里生活';
  const initial = nickName ? nickName.slice(0, 1) : '里';
  const avatarUrl = resolve(profile.avatarUrl);
  const hours = context.businessStart
    ? `营业 ${context.businessStart}—${context.businessEnd} · 配送 ${context.deliveryStart}—${context.deliveryEnd}`
    : '营业时间待确认';

  return (
    <div className="screen screen-tabbed profile-page">
      <div className="page-lead">
        <div className="small-kicker">MY NEIGHBOURHOOD / 我的社区</div>
        <div className="page-title">住得近一点，<div>生活轻松一点<span className="title-period">.</span></div></div>
        <div className="page-sub">常用地址、需求登记与社区服务</div>
      </div>

      <section className="profile-hero">
        <div className="profile-avatar">
          {avatarUrl ? <img className="avatar-image" src={avatarUrl} alt={displayName} /> : initial}
        </div>
        <div className="profile-hero-copy">
          <div className="profile-hero-title">{displayName}</div>
          <div className="profile-hero-sub">取快递 · 买日常 · 分享好物</div>
        </div>
        <button type="button" className="profile-edit" onClick={() => navigate('/profile/edit')}>编辑　›</button>
      </section>

      <section className="profile-section">
        <div className="profile-section-heading">个人资料</div>
        <button type="button" className="profile-row" onClick={() => navigate('/profile/edit')}>
          <span>
            <span className="profile-row-title">头像与昵称</span>
            <span className="profile-row-sub">{nickName ? `当前昵称：${nickName}` : '还没有设置头像与昵称'}</span>
          </span>
          <span>{nickName || profile.avatarUrl ? '修改　›' : '去完善　›'}</span>
        </button>
      </section>

      <section className="profile-section">
        <div className="profile-section-heading">社区服务</div>
        <button type="button" className="profile-row" onClick={() => redirect('/forum')}>
          <span>
            <span className="profile-row-title">邻里广场</span>
            <span className="profile-row-sub">闲聊 · 互助求助 · 失物招领 · 社区公告</span>
          </span>
          <span>进入　›</span>
        </button>
        <button type="button" className="profile-row" onClick={() => navigate('/service/express')}>
          <span>
            <span className="profile-row-title">快递代取</span>
            <span className="profile-row-sub">查看代取流程与须知</span>
          </span>
          <span>查看　›</span>
        </button>
        <button type="button" className="profile-row" onClick={() => navigate('/service/purchase')}>
          <span>
            <span className="profile-row-title">京东便利店代买</span>
            <span className="profile-row-sub">非官方社区代买</span>
          </span>
          <span>查看　›</span>
        </button>
        <button type="button" className="profile-row" onClick={() => navigate('/service/secondhand')}>
          <span>
            <span className="profile-row-title">二手物品分享</span>
            <span className="profile-row-sub">二手转让与免费分享</span>
          </span>
          <span>查看　›</span>
        </button>
      </section>

      <section className="profile-section">
        <div className="profile-section-heading">配送服务</div>
        <div className="profile-row static">
          <span>
            <span className="profile-row-title">保利爱尚里上门配送</span>
            <span className="profile-row-sub">仅限小区 16、17、18 栋</span>
          </span>
          <span>送到门口</span>
        </div>
        <div className="profile-row static">
          <span>
            <span className="profile-row-title">送达方式自选</span>
            <span className="profile-row-sub">登记时选择敲门或到达后电话联系</span>
          </span>
          <span>{CONTACT_LABELS.knock}</span>
        </div>
        <div className="profile-row static">
          <span>
            <span className="profile-row-title">营业与配送</span>
            <span className="profile-row-sub">{hours}</span>
          </span>
          <span>{context.isOpen ? '接单中' : '休息中'}</span>
        </div>
        <div className="profile-row static">
          <span>
            <span className="profile-row-title">配送规则</span>
            <span className="profile-row-sub">
              商品满 ¥{((context.minOrderCents || 0) / 100).toFixed(2)} 起送 · 配送费 ¥{((context.deliveryFeeCents || 0) / 100).toFixed(2)}
            </span>
          </span>
          <span>线下结算</span>
        </div>
      </section>

      <section className="profile-section">
        <button type="button" className="profile-row" onClick={() => navigate('/address')}>
          <span>
            <span className="profile-row-title">我的收货地址</span>
            <span className="profile-row-sub">管理常用楼栋、门牌号和联系电话</span>
          </span>
          <span>查看　›</span>
        </button>
        <button type="button" className="profile-row" onClick={() => navigate('/orders')}>
          <span>
            <span className="profile-row-title">我的需求登记</span>
            <span className="profile-row-sub">查看处理进度与历史记录</span>
          </span>
          <span>查看　›</span>
        </button>
      </section>

      <div className="compliance-note">
        <div className="compliance-title">温馨提示</div>
        <div>
          本页面仅提供社区便民信息展示与需求登记，不提供在线下单、在线支付与交易担保。需求登记后可在「我的需求」中查看处理进度，实际商品、费用与送达以店家线下与您确认为准。
        </div>
      </div>

      <button type="button" className="profile-link" onClick={() => redirect('/')}>逛便利铺商品　→</button>
      <div className="profile-footer">保利爱尚里 · 爱尚里生活</div>
    </div>
  );
}
