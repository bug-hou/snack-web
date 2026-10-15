import React, { useEffect, useState } from 'react';
import { Chip, Icon } from '../ui';
import { DEFAULT_SETTINGS, beijingClock, serviceState, yuan } from '../utils';

export default function Dashboard({ settings, stats, onNavigate }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const s = { ...DEFAULT_SETTINGS, ...settings };
  const t = stats || {};
  const shop = serviceState(s.ordersEnabled, s.businessStart, s.businessEnd, tick);
  const expressWindow = s.expressFollowShop ? { start: s.businessStart, end: s.businessEnd } : { start: s.expressStart, end: s.expressEnd };
  const express = serviceState(s.expressEnabled, expressWindow.start, expressWindow.end, tick);
  const purchase = serviceState(s.purchaseEnabled, s.purchaseStart, s.purchaseEnd, tick);
  const toneOf = state => (state.tone === 'on' ? 'green' : state.tone === 'wait' ? 'amber' : 'grey');

  const services = [
    { key: 'orders', icon: 'products', name: '便利铺现货', state: shop, time: `${s.businessStart}—${s.businessEnd}`, desc: `${s.minOrderCents ? `满 ${yuan(s.minOrderCents)} 起送 · ` : ''}配送费 ${yuan(s.deliveryFeeCents)}` },
    { key: 'orders', icon: 'products', name: '快递代取', state: express, time: `${expressWindow.start}—${expressWindow.end}`, desc: `${s.expressStations?.length || 0} 个站点 · 基础 ${yuan(s.expressBaseFeeCents)}` },
    { key: 'orders', icon: 'products', name: '便利店代买', state: purchase, time: `${s.purchaseStart}—${s.purchaseEnd}`, desc: `${s.purchaseStore || '京东便利店'} · 跑腿费 ${yuan(s.purchaseFeeCents)}` },
    { key: 'shares', icon: 'shares', name: '二手闲置', state: s.secondhandEnabled ? { label: '已开放', tone: 'on' } : { label: '未开放', tone: 'off' }, time: '发布即公开', desc: '可在闲置管理中下架' }
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>经营概览</h1>
          <p>北京时间 {beijingClock(tick)} · 数据每 30 秒随页面切换刷新。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => onNavigate('orders')}><Icon name="orders" size={15} />去处理订单</button>
          <button className="btn btn-primary" onClick={() => onNavigate('products')}><Icon name="plus" size={15} />上架商品</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className={`stat${(t.pendingCount || 0) > 0 ? ' alert' : ''}`}>
          <span><Icon name="clock" size={14} />待处理订单</span>
          <strong>{t.pendingCount ?? '—'}</strong>
          <small>需要尽快确认</small>
        </div>
        <div className="stat">
          <span><Icon name="orders" size={14} />今日订单</span>
          <strong>{t.todayCount ?? '—'}</strong>
          <small>北京时间今日 00:00 起</small>
        </div>
        <div className="stat">
          <span><Icon name="wallet" size={14} />今日成交额</span>
          <strong>{yuan(t.todayRevenueCents)}</strong>
          <small>不含已取消订单</small>
        </div>
        <div className="stat">
          <span><Icon name="products" size={14} />在售商品</span>
          <strong>{t.productCount ?? '—'}</strong>
          <small>不含已归档商品</small>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat"><span><Icon name="users" size={14} />顾客总数</span><strong>{t.userCount ?? '—'}</strong><small>下单或保存过地址</small></div>
        <div className="stat"><span><Icon name="shares" size={14} />在架闲置</span><strong>{t.shareCount ?? '—'}</strong><small>邻居发布的二手物品</small></div>
        <div className="stat"><span><Icon name="posts" size={14} />广场帖子</span><strong>{t.postCount ?? '—'}</strong><small>邻里广场内容</small></div>
        <div className="stat">
          <span><Icon name="pin" size={14} />服务范围</span>
          <strong style={{ fontSize: 20 }}>16 / 17 / 18 栋</strong>
          <small>保利爱尚里</small>
        </div>
      </div>

      <h2 style={{ fontSize: 17, margin: '6px 0 12px' }}>社区服务状态</h2>
      <div className="settings-grid">
        {services.map(item => (
          <div className="setting-card" key={item.name}>
            <div className="setting-head">
              <span className="setting-ico"><Icon name={item.icon} size={15} /></span>
              <h2>{item.name}</h2>
              <Chip tone={toneOf(item.state)}>{item.state.label}</Chip>
            </div>
            <p>服务时间 {item.time}</p>
            <div className="setting-body">
              <div className="row-between">
                <span className="small muted">{item.desc}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(item.key)}>管理<Icon name="arrow" size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
