import { useState } from 'react';
import Icon from '../components/Icon';
import { NavBar } from '../components/Layout';
import { navigate, redirect } from '../lib/router';
import { services } from '../lib/data';
import { confirm } from '../lib/ui';

const ICON_OF = { express: 'package', purchase: 'bag', secondhand: 'repeat' };

export default function Service({ type = 'express' }) {
  const [active, setActive] = useState(type);
  const service = services.find(item => item.id === active) || services[0];

  async function showSharingGuide() {
    await confirm({
      title: '物品发布须知',
      content: '分享区尚未开放发布。开放后请上传实物照片、如实说明成色和瑕疵，选择二手转让或免费分享；不要公开手机号和完整门牌号，建议在小区公共区域当面交接。',
      confirmText: '我知道了',
      showCancel: false
    });
  }

  function primaryAction() {
    if (service.id === 'secondhand') { showSharingGuide(); return; }
    if (service.id === 'purchase') { redirect('/'); return; }
    navigate('/address');
  }

  return (
    <div className="screen screen-padded service-page">
      <NavBar title="社区服务" fallback="/" />

      <div className="service-tabs">
        {services.map(item => (
          <button
            key={item.id}
            type="button"
            className={`service-tab ${service.id === item.id ? 'active' : ''}`}
            onClick={() => setActive(item.id)}
          >
            {item.shortTitle}
          </button>
        ))}
      </div>

      <section className="service-hero">
        <div className="hero-copy">
          <span className="hero-label">{service.label}</span>
          <div className="hero-title">{service.title}</div>
          <div className="hero-subtitle">{service.subtitle}</div>
        </div>
        <div className="hero-icon"><Icon name={ICON_OF[service.id]} size={26} /></div>
      </section>

      <div className="hero-description">{service.description}</div>

      <section className="preparation-card">
        <div className="preparation-line">
          <span className="status-dot" />
          <span>服务筹备中</span>
        </div>
        <div className="preparation-copy">
          {service.id === 'secondhand' ? '尚未开放物品浏览与发布，以下为分享流程说明。' : '暂未开放需求登记，服务范围、费用与时间确认后再开放。'}
        </div>
      </section>

      <div className="section-heading">
        <span>{service.id === 'secondhand' ? '好物分享，只需三步' : '服务将这样进行'}</span>
        <span className="section-caption">流程说明</span>
      </div>
      <section className="steps-card">
        {service.steps.map((step, index) => (
          <div key={step.title} className="step-row">
            <div className="step-number">0{index + 1}</div>
            <div className="step-copy">
              <div className="step-title">{step.title}</div>
              <div className="step-description">{step.description}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="section-heading">
        <span>{service.id === 'secondhand' ? '友好的邻里，安心的分享' : '先说清楚，再放心使用'}</span>
      </div>
      <section className="rules-card">
        {service.rules.map(rule => (
          <div key={rule.title} className="rule-row">
            <div className="rule-title">{rule.title}</div>
            <div className="rule-description">{rule.description}</div>
          </div>
        ))}
      </section>

      {service.id === 'purchase' ? (
        <section className="existing-shop">
          <div className="existing-title">现在需要买点东西？</div>
          <div className="existing-description">原口袋便利铺商品信息可继续查看，库存与营业状态以商品区为准。</div>
          <button type="button" className="existing-link" onClick={() => redirect('/')}>浏览便利铺商品 <span>→</span></button>
        </section>
      ) : null}

      <div className="page-footnote">保利爱尚里 · 让邻里生活近一点</div>

      <div className="service-footer">
        <button type="button" className="footer-secondary" onClick={() => redirect('/')}>返回社区</button>
        <button type="button" className="footer-primary" onClick={primaryAction}>
          {service.id === 'secondhand' ? '查看发布须知' : service.id === 'purchase' ? '先看便利铺商品' : '管理收货地址'}
        </button>
      </div>
    </div>
  );
}
