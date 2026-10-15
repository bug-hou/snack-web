import React, { useEffect, useState } from 'react';
import { invoke } from '../cloud';
import { useToast, Switch, Field, Chip, Icon, Alert } from '../ui';
import { DEFAULT_SETTINGS, centsToInput, toCents, beijingClock, serviceState } from '../utils';

const feeState = settings => ({
  min: centsToInput(settings.minOrderCents),
  delivery: centsToInput(settings.deliveryFeeCents),
  expressBase: centsToInput(settings.expressBaseFeeCents ?? 300),
  expressExtra: centsToInput(settings.expressExtraFeeCents ?? 100),
  expressLarge: centsToInput(settings.expressLargeFeeCents ?? 100),
  purchaseFee: centsToInput(settings.purchaseFeeCents ?? 500)
});

export default function Settings({ settings, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [fees, setFees] = useState(() => feeState({ ...DEFAULT_SETTINGS, ...settings }));
  const [stations, setStations] = useState(Array.isArray(settings.expressStations) ? settings.expressStations : []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    setForm(merged);
    setFees(feeState(merged));
    setStations(Array.isArray(settings.expressStations) ? settings.expressStations : []);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const set = patch => { setForm(prev => ({ ...prev, ...patch })); setDirty(true); };
  const setFee = patch => { setFees(prev => ({ ...prev, ...patch })); setDirty(true); };

  const shopState = serviceState(form.ordersEnabled, form.businessStart, form.businessEnd, tick);
  const expressWindow = form.expressFollowShop
    ? { start: form.businessStart, end: form.businessEnd }
    : { start: form.expressStart, end: form.expressEnd };
  const expressState = serviceState(form.expressEnabled, expressWindow.start, expressWindow.end, tick);
  const purchaseState = serviceState(form.purchaseEnabled, form.purchaseStart, form.purchaseEnd, tick);

  function addStation(e) {
    if (e) e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (name.length > 20) { setError('快递站点名称请控制在 20 字以内'); return; }
    if (stations.length >= 10) { setError('最多配置 10 个快递站点'); return; }
    if (stations.includes(name)) { setError('该快递站点已存在'); return; }
    setStations([...stations, name]);
    setDraft('');
    setDirty(true);
  }
  function moveStation(index, step) {
    const next = index + step;
    if (next < 0 || next >= stations.length) return;
    const list = [...stations];
    [list[index], list[next]] = [list[next], list[index]];
    setStations(list);
    setDirty(true);
  }

  async function save(e) {
    if (e) e.preventDefault();
    if (busy) return;
    const payload = {
      ...form,
      minOrderCents: toCents(fees.min),
      deliveryFeeCents: toCents(fees.delivery),
      expressBaseFeeCents: toCents(fees.expressBase),
      expressExtraFeeCents: toCents(fees.expressExtra),
      expressLargeFeeCents: toCents(fees.expressLarge),
      purchaseFeeCents: toCents(fees.purchaseFee),
      expressStations: stations.slice(0, 10)
    };
    const bad = Object.entries(payload).filter(([, v]) => Number.isNaN(v));
    if (bad.length) { setError('金额填写不正确，请检查后再保存'); return; }
    setBusy(true); setError('');
    try {
      const next = await invoke('saveSettings', payload);
      const merged = { ...DEFAULT_SETTINGS, ...next };
      setForm(merged); setFees(feeState(merged));
      setStations(Array.isArray(next.expressStations) ? next.expressStations : []);
      setDirty(false);
      toast('设置已保存，小程序将同步生效');
      if (onSaved) onSaved(merged);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Store Settings</span>
          <h1>营业设置</h1>
          <p>本店只服务保利爱尚里 16、17、18 栋。当前北京时间 {beijingClock(tick)}，保存后小程序立即同步。</p>
        </div>
        <div className="page-head-actions">
          <Chip tone={shopState.tone === 'on' ? 'green' : shopState.tone === 'wait' ? 'amber' : 'grey'}>便利铺 {shopState.label}</Chip>
        </div>
      </div>

      {error && <Alert tone="error" onClose={() => setError('')}>{error}</Alert>}

      <div className="settings-grid">
        <section className="setting-card">
          <div className="setting-head"><span className="setting-ico">01</span><h2>营业与配送</h2></div>
          <p>每日按北京时间执行；关闭后顾客无法提交订单。</p>
          <div className="setting-body">
            <Switch title="接受新订单" hint="手动暂停接单时关闭" checked={form.ordersEnabled} onChange={v => set({ ordersEnabled: v })} />
            <div className="grid-2">
              <Field label="营业开始"><input className="input" type="time" value={form.businessStart} onChange={e => set({ businessStart: e.target.value })} required /></Field>
              <Field label="营业结束"><input className="input" type="time" value={form.businessEnd} onChange={e => set({ businessEnd: e.target.value })} required /></Field>
              <Field label="配送开始"><input className="input" type="time" value={form.deliveryStart} onChange={e => set({ deliveryStart: e.target.value })} required /></Field>
              <Field label="配送结束"><input className="input" type="time" value={form.deliveryEnd} onChange={e => set({ deliveryEnd: e.target.value })} required /></Field>
            </div>
            <span className="fine">仅支持同日时段；营业与配送时段重合时，顾客才可下单。</span>
          </div>
        </section>

        <section className="setting-card">
          <div className="setting-head"><span className="setting-ico">02</span><h2>订单金额</h2></div>
          <p>金额以元计；货到后线下结算，店铺不处理线上支付。</p>
          <div className="setting-body">
            <div className="grid-2">
              <Field label="最低起送金额（元）"><input className="input" type="number" min="0" max="10000" step="0.01" value={fees.min} onChange={e => setFee({ min: e.target.value })} required /></Field>
              <Field label="每单配送费（元）"><input className="input" type="number" min="0" max="100" step="0.01" value={fees.delivery} onChange={e => setFee({ delivery: e.target.value })} required /></Field>
            </div>
            <span className="fine">起送金额按商品小计计算，不含配送费。</span>
            <Field label="小程序店主身份标识（可选）" hint="填写 openid 后，可在小程序内直接处理订单">
              <input className="input" value={form.ownerOpenid || ''} placeholder="留空则使用环境变量中的店主" onChange={e => set({ ownerOpenid: e.target.value.trim() })} />
            </Field>
          </div>
        </section>

        <section className="setting-card wide">
          <div className="setting-head"><span className="setting-ico">03</span><h2>店主微信</h2></div>
          <p>填写后，顾客在小程序「我的」页可一键复制你的微信号，方便沟通。</p>
          <div className="setting-body">
            <Field label="店主微信号" hint="3-40 位字母、数字、下划线或减号">
              <input className="input" value={form.ownerWechat || ''} maxLength={40} placeholder="例如 my_shop_wx" onChange={e => set({ ownerWechat: e.target.value.trim() })} />
            </Field>
            <span className="fine">{form.ownerWechat ? `小程序将展示：添加店主微信 ${form.ownerWechat}` : '当前未填写，小程序不会展示该提示。'}</span>
          </div>
        </section>

        <section className="setting-card wide">
          <div className="setting-head">
            <span className="setting-ico">04</span><h2>快递代取</h2>
            <Chip tone={expressState.tone === 'on' ? 'green' : expressState.tone === 'wait' ? 'amber' : 'grey'}>{expressState.label}</Chip>
          </div>
          <p>开启后，顾客选择快递站点、粘贴短信自动识别取件码并下单代取。</p>
          <div className="setting-body">
            <div className="grid-2">
              <Switch title="开启快递代取" hint="关闭时顾客无法提交代取订单" checked={form.expressEnabled} onChange={v => set({ expressEnabled: v })} />
              <Switch title="跟随店铺营业时间" hint={`开启后代取与店铺同时营业（${form.businessStart}—${form.businessEnd}）`} checked={form.expressFollowShop} onChange={v => set({ expressFollowShop: v })} />
            </div>
            <div className="grid-3">
              <Field label="基础跑腿费（元，含首件）"><input className="input" type="number" min="0" max="100" step="0.01" value={fees.expressBase} onChange={e => setFee({ expressBase: e.target.value })} required /></Field>
              <Field label="每多一件加价（元）"><input className="input" type="number" min="0" max="100" step="0.01" value={fees.expressExtra} onChange={e => setFee({ expressExtra: e.target.value })} required /></Field>
              <Field label="每个大件加价（元）"><input className="input" type="number" min="0" max="100" step="0.01" value={fees.expressLarge} onChange={e => setFee({ expressLarge: e.target.value })} required /></Field>
            </div>
            <div className="grid-2">
              <Field label="服务开始"><input className="input" type="time" value={form.expressStart} onChange={e => set({ expressStart: e.target.value })} required /></Field>
              <Field label="服务结束"><input className="input" type="time" value={form.expressEnd} onChange={e => set({ expressEnd: e.target.value })} required /></Field>
            </div>
            <span className="fine">费用 = 基础跑腿费（含首件）＋ 每多一件加价 ＋ 每个大件加价。</span>

            <div className="card card-pad" style={{ padding: 14, background: 'var(--brand-softer)' }}>
              <div className="row-between">
                <strong className="small">快递站点</strong>
                <Chip tone="amber">{stations.length} / 10</Chip>
              </div>
              <p className="fine" style={{ margin: '6px 0 12px' }}>顾客只能从下方站点中选择。建议写成「驿站名（位置）」，例如「菜鸟驿站（16 栋架空层）」。改动后需点击底部保存。</p>
              {stations.length > 0 && (
                <ul className="station-list">
                  {stations.map((name, i) => (
                    <li key={`${name}-${i}`}>
                      <span className="idx">{i + 1}</span>
                      <span className="name">{name}</span>
                      <button type="button" className="mini" onClick={() => moveStation(i, -1)} disabled={i === 0}><Icon name="up" size={12} /></button>
                      <button type="button" className="mini" onClick={() => moveStation(i, 1)} disabled={i === stations.length - 1}><Icon name="down" size={12} /></button>
                      <button type="button" className="mini danger" onClick={() => { setStations(stations.filter(item => item !== name)); setDirty(true); }}><Icon name="trash" size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {!stations.length && <p className="fine" style={{ color: 'var(--red)' }}>还没有配置站点，开启代取后顾客也无法下单。</p>}
              <div className="row" style={{ marginTop: 12 }}>
                <input className="input" style={{ maxWidth: 320 }} value={draft} maxLength={20} placeholder="如：菜鸟驿站（16栋架空层）"
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStation(e); } }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={addStation} disabled={!draft.trim() || stations.length >= 10}>
                  <Icon name="plus" size={13} />添加站点
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="setting-card">
          <div className="setting-head">
            <span className="setting-ico">05</span><h2>便利店代买</h2>
            <Chip tone={purchaseState.tone === 'on' ? 'green' : purchaseState.tone === 'wait' ? 'amber' : 'grey'}>{purchaseState.label}</Chip>
          </div>
          <p>顾客提交清单，店主报价并确认后代买。</p>
          <div className="setting-body">
            <Switch title="开启便利店代买" hint="关闭时顾客无法提交代买订单" checked={form.purchaseEnabled} onChange={v => set({ purchaseEnabled: v })} />
            <div className="grid-2">
              <Field label="每单跑腿费（元）"><input className="input" type="number" min="0" max="100" step="0.01" value={fees.purchaseFee} onChange={e => setFee({ purchaseFee: e.target.value })} required /></Field>
              <Field label="代买门店名称"><input className="input" value={form.purchaseStore || ''} maxLength={20} placeholder="京东便利店" onChange={e => set({ purchaseStore: e.target.value })} /></Field>
              <Field label="服务开始"><input className="input" type="time" value={form.purchaseStart} onChange={e => set({ purchaseStart: e.target.value })} required /></Field>
              <Field label="服务结束"><input className="input" type="time" value={form.purchaseEnd} onChange={e => set({ purchaseEnd: e.target.value })} required /></Field>
            </div>
            <span className="fine">商品金额由店主按实际购买情况报价，顾客确认后开始代买。</span>
          </div>
        </section>

        <section className="setting-card">
          <div className="setting-head"><span className="setting-ico">06</span><h2>二手物品分享</h2></div>
          <p>居民可发布闲置，发布后立即公开；免费分享不收取费用。</p>
          <div className="setting-body">
            <Switch title="开启二手分享" hint="关闭后小程序不再展示发布入口" checked={form.secondhandEnabled} onChange={v => set({ secondhandEnabled: v })} />
            <span className="fine">物品发布即公开，可在「闲置管理」中下架；发布与交接请注意隐私与人身安全。</span>
          </div>
        </section>
      </div>

      <div className="save-bar">
        <span>{dirty ? '有未保存的修改，保存后小程序立即生效。' : '所有修改已保存。'}</span>
        <button className="btn btn-primary" disabled={busy}>{busy ? '保存中…' : '保存营业设置'}</button>
      </div>
    </form>
  );
}
