import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Card, Chip, Message, Spinner } from '../components/Bits';
import { navigate, redirect } from '../lib/router';
import { invoke } from '../lib/cloud';
import { getAddresses, peekContext, loadContext } from '../lib/shop';
import {
  MAX_PACKAGES, PACKAGE_SIZES, QUICK_NOTES, SMS_SAMPLE,
  expressFee, money, parsePickupText, safeCents, services
} from '../lib/data';
import { confirm, toast } from '../lib/ui';

const emptyPackage = () => ({ code: '', phoneLast4: '', size: 'small' });
const emptyItem = () => ({ name: '', spec: '', quantity: 1 });

export default function Errand({ type = 'express' }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressIndex, setAddressIndex] = useState(-1);
  const [station, setStation] = useState('');
  const [packages, setPackages] = useState([emptyPackage()]);
  const [items, setItems] = useState([emptyItem()]);
  const [allowSubstitute, setAllowSubstitute] = useState(true);
  const [budget, setBudget] = useState('');
  const [note, setNote] = useState('');
  const [activeNotes, setActiveNotes] = useState([]);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [parseNote, setParseNote] = useState('');
  const [parseTone, setParseTone] = useState('');
  const [status, setStatus] = useState({ text: '', tone: '', serviceTime: '', stations: [] });
  const [notesOpen, setNotesOpen] = useState(false);

  const currentAddress = addresses[addressIndex] || null;
  const tail = currentAddress
    ? (currentAddress.pickupPhoneLast4 || String(currentAddress.phone || '').slice(-4))
    : '';
  const addressText = currentAddress ? `保利爱尚里 ${currentAddress.building}栋 ${currentAddress.room}` : '还没有收货地址';
  const addressPerson = currentAddress
    ? `${currentAddress.recipient} · ${currentAddress.phone}`
    : '添加一个地址，登记时就不用重复填';

  const isExpress = type === 'express';
  const introduction = services.find(item => item.id === type) || services[0];

  const applyConfig = useCallback((context) => {
    const next = isExpress ? context.express : context.purchase;
    if (!next) return;
    const stations = Array.isArray(next.stations) ? next.stations : [];
    setConfig(next);
    setStatus({
      text: next.enabled ? '在线' : next.configured ? '下线' : '未开放',
      tone: next.enabled ? 'on' : next.configured ? 'wait' : 'off',
      serviceTime: `${next.start}—${next.end}`,
      stations
    });
    setStation(current => (stations.includes(current) ? current : (stations.length === 1 ? stations[0] : '')));
  }, [isExpress]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [context, addressResult] = await Promise.all([loadContext(), getAddresses()]);
      applyConfig(context);
      const list = (addressResult && addressResult.list) || [];
      const selected = addressResult && addressResult.selected;
      const index = selected ? list.findIndex(item => item.id === selected.id) : 0;
      setAddresses(list);
      setAddressIndex(list.length ? (index >= 0 ? index : 0) : -1);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setError(e.message || '加载失败，请稍后重试');
    }
  }, [applyConfig]);

  useEffect(() => {
    const cached = peekContext();
    if (cached) applyConfig(cached);
    loadAll();
  }, [applyConfig, loadAll]);

  const fee = useMemo(() => {
    if (!config) return { text: '0.00', detail: [] };
    if (!isExpress) return { text: money(config.feeCents), detail: [] };
    const count = packages.length;
    const largeCount = packages.filter(pkg => pkg.size === 'large').length;
    const total = expressFee(config, count, largeCount);
    const detail = [{ label: `首件跑腿费（${count} 件）`, value: money(config.baseFeeCents) }];
    if (count > 1) detail.push({ label: `加 ${count - 1} 件`, value: money(safeCents(config.extraFeeCents) * (count - 1)) });
    if (largeCount > 0) detail.push({ label: `大件 ${largeCount} 件`, value: money(safeCents(config.largeFeeCents) * largeCount) });
    return { text: money(total), detail, total };
  }, [config, isExpress, packages]);

  const feeRule = useMemo(() => {
    if (!config) return '';
    return isExpress
      ? `首件 ¥${money(config.baseFeeCents)}，每多一件 +¥${money(config.extraFeeCents)}${safeCents(config.largeFeeCents) > 0 ? `，大件 +¥${money(config.largeFeeCents)}` : ''}`
      : `跑腿费 ¥${money(config.feeCents)}，商品金额按实际门店报价`;
  }, [config, isExpress]);

  function updatePackage(index, key, value) {
    setPackages(list => list.map((pkg, i) => (i === index ? { ...pkg, [key]: value } : pkg)));
  }
  function updateItem(index, key, value) {
    setItems(list => list.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  function parseSms() {
    const result = parsePickupText(smsText, status.stations);
    if (!result.packages.length) {
      setParseNote(result.warnings[0] || '没能识别出取件码');
      setParseTone('warn');
      return;
    }
    const incoming = result.packages.map(pkg => ({ ...pkg, phoneLast4: pkg.phoneLast4 || tail }));
    let base = packages;
    if (base.length === 1 && !base[0].code) base = [];
    const merged = base.concat(incoming).slice(0, MAX_PACKAGES);
    let nextNote = `识别到 ${incoming.length} 个包裹，已填入，可再核对一下`;
    let nextTone = 'ok';
    if (merged.length < base.length + incoming.length) {
      nextNote = `识别到 ${incoming.length} 个包裹，一次最多代取 ${MAX_PACKAGES} 个，已取前 ${MAX_PACKAGES} 个`;
      nextTone = 'warn';
    }
    const guessed = incoming.find(pkg => pkg.station && status.stations.includes(pkg.station));
    if (guessed && !station) setStation(guessed.station);
    setPackages(merged);
    setParseNote(nextNote);
    setParseTone(nextTone);
    setSmsOpen(false);
  }

  function toggleNote(text) {
    const next = activeNotes.includes(text) ? activeNotes.filter(item => item !== text) : activeNotes.concat(text);
    setActiveNotes(next);
    setNote(next.join('；'));
  }

  async function submit() {
    if (submitting) return;
    if (!config || !config.enabled) {
      toast(status.text === '下线' ? `当前不在服务时间（${status.serviceTime}）` : '服务暂未开放');
      return;
    }
    const address = addresses[addressIndex];
    if (!address) { toast('请选择收货地址'); return; }

    const payload = {
      type,
      addressId: address.id,
      requestId: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      note,
      expectedTotalCents: isExpress ? (fee.total || 0) : config.feeCents,
      deliveryAt: 0
    };

    if (isExpress) {
      if (!status.stations.length) { toast('商家还没配置快递站点'); return; }
      if (!station) { toast('请选择快递站点'); return; }
      const clean = packages.map(pkg => ({
        code: (pkg.code || '').trim(),
        phoneLast4: (pkg.phoneLast4 || '').trim(),
        size: pkg.size
      }));
      const invalid = clean.find(pkg => !pkg.code || !/^[0-9A-Za-z-]{4,32}$/.test(pkg.code) || !/^\d{4}$/.test(pkg.phoneLast4));
      if (invalid) { toast('请填写取件码和4位手机尾号'); return; }
      payload.station = station;
      payload.packages = clean;
    } else {
      const clean = items.map(item => ({
        name: (item.name || '').trim(),
        spec: (item.spec || '').trim(),
        quantity: Number(item.quantity) || 1
      }));
      if (clean.some(item => !item.name || item.quantity < 1 || item.quantity > 20)) {
        toast('请填写商品名称和1-20的数量');
        return;
      }
      const budgetCents = budget === '' ? 0 : Math.round(Number(budget) * 100);
      if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 1000000) {
        toast('预估商品金额不正确');
        return;
      }
      payload.items = clean;
      payload.allowSubstitute = allowSubstitute;
      payload.budgetCents = budgetCents;
    }

    const summary = isExpress
      ? `站点：${station}\n包裹：${payload.packages.length} 个\n收货：${addressText}\n跑腿费：¥${money(payload.expectedTotalCents)}（线下当面结算）`
      : `门店：${config.store || '京东便利店'}\n商品：${payload.items.length} 项\n收货：${addressText}\n跑腿费：¥${money(payload.expectedTotalCents)}，商品按实际报价`;

    const ok = await confirm({
      title: isExpress ? '确认代取信息' : '确认代买清单',
      content: summary,
      confirmText: '确认登记',
      cancelText: '再看看'
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await invoke('createServiceOrder', payload);
      toast(isExpress ? '代取需求已登记' : '代买需求已登记');
      redirect('/orders');
    } catch (e) {
      toast(e.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen screen-padded errand-page">
      <PageHeader
        title={isExpress ? '快递代取' : '便利店代买'}
        sub={isExpress ? '选择站点，粘贴短信自动识别取件码' : '列好清单，跑腿带回'}
      />

      {config ? (
        <div className={`status-bar ${status.tone}`}>
          <span className="status-dot" />
          <span className="status-text">{status.text}</span>
          <span className="status-time">服务时间 {status.serviceTime}</span>
        </div>
      ) : null}

      {loading ? <Spinner label="正在加载服务信息…" /> : null}
      {!loading && error ? <Message onClick={loadAll}>{error} · 点击重试</Message> : null}

      {!loading && !error ? (
        <>
          <Card
            title="送到哪里"
            extra={<button type="button" className="card-action" onClick={() => navigate('/address?from=errand')}>{addresses.length ? '更换' : '去添加'}</button>}
          >
            <div className="address-box">
              <div className="address-strong">{addressText}</div>
              <div className="address-sub">{addressPerson}</div>
              {tail ? <div className="tail-line">取件手机尾号 <span className="tail-value">{tail}</span></div> : null}
            </div>
          </Card>

          {isExpress ? (
            <>
              <Card title="快递站点" extra={<span className="card-note">只支持选择，站点由商家配置</span>}>
                {status.stations.length ? (
                  <div className="chip-wrap">
                    {status.stations.map(item => (
                      <Chip key={item} active={station === item} onClick={() => setStation(item)}>{item}</Chip>
                    ))}
                  </div>
                ) : <div className="empty-line">商家还没有配置快递站点，暂时无法登记</div>}
              </Card>

              <Card
                title="包裹信息"
                extra={<button type="button" className="card-action" onClick={() => { setSmsOpen(true); setParseNote(''); setParseTone(''); }}>粘贴短信识别</button>}
              >
                {smsOpen ? (
                  <div className="sms-box">
                    <textarea
                      className="textarea"
                      rows={4}
                      value={smsText}
                      maxLength={2000}
                      placeholder="把快递短信整段粘贴进来，可以同时识别多个包裹"
                      onChange={event => setSmsText(event.target.value)}
                    />
                    <div className="sms-sample">示例：{SMS_SAMPLE}</div>
                    <div className="sms-actions">
                      <button type="button" className="sms-btn primary" onClick={parseSms}>识别并填入</button>
                      {smsText ? <button type="button" className="sms-btn ghost" onClick={() => { setSmsText(''); setParseNote(''); }}>清空</button> : null}
                      <button type="button" className="sms-btn ghost" onClick={() => setSmsOpen(false)}>收起</button>
                    </div>
                  </div>
                ) : parseNote ? <div className={`parse-note ${parseTone}`}>{parseNote}</div> : null}

                {packages.map((pkg, index) => (
                  <div key={`pkg-${index}`} className="pkg">
                    <div className="pkg-head">
                      <span className="pkg-index">包裹 {index + 1}</span>
                      {packages.length > 1 ? (
                        <button type="button" className="pkg-remove" onClick={() => setPackages(list => list.filter((_, i) => i !== index))}>移除</button>
                      ) : null}
                    </div>
                    <label className="pkg-row">
                      <span className="pkg-label">取件码</span>
                      <input
                        className="pkg-input"
                        value={pkg.code}
                        maxLength={32}
                        placeholder="如 8-1-2345"
                        onChange={event => updatePackage(index, 'code', event.target.value)}
                      />
                    </label>
                    <label className="pkg-row">
                      <span className="pkg-label">手机尾号</span>
                      <input
                        className="pkg-input"
                        inputMode="numeric"
                        value={pkg.phoneLast4}
                        maxLength={4}
                        placeholder="手机号后4位"
                        onChange={event => updatePackage(index, 'phoneLast4', event.target.value)}
                      />
                    </label>
                    <div className="size-row">
                      {PACKAGE_SIZES.map(size => (
                        <button
                          key={size.value}
                          type="button"
                          className={`size ${pkg.size === size.value ? 'chosen' : ''}`}
                          onClick={() => updatePackage(index, 'size', size.value)}
                        >
                          <span className="size-label">{size.label}</span>
                          <span className="size-hint">{size.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {packages.length < MAX_PACKAGES ? (
                  <button
                    type="button"
                    className="add-more"
                    onClick={() => setPackages(list => list.concat({ ...emptyPackage(), phoneLast4: tail }))}
                  >
                    ＋ 再加一个包裹（最多 {MAX_PACKAGES} 个）
                  </button>
                ) : null}
              </Card>
            </>
          ) : (
            <Card title="代买清单">
              <div className="hint">{config ? config.store : '京东便利店'}等非官方代买，商品金额按实际门店结算</div>
              {items.map((item, index) => (
                <div key={`item-${index}`} className="pkg">
                  <div className="pkg-head">
                    <span className="pkg-index">商品 {index + 1}</span>
                    {items.length > 1 ? (
                      <button type="button" className="pkg-remove" onClick={() => setItems(list => list.filter((_, i) => i !== index))}>移除</button>
                    ) : null}
                  </div>
                  <label className="pkg-row">
                    <span className="pkg-label">名称</span>
                    <input className="pkg-input" value={item.name} maxLength={40} placeholder="如 可口可乐" onChange={event => updateItem(index, 'name', event.target.value)} />
                  </label>
                  <label className="pkg-row">
                    <span className="pkg-label">规格</span>
                    <input className="pkg-input" value={item.spec} maxLength={30} placeholder="选填，如 500ml" onChange={event => updateItem(index, 'spec', event.target.value)} />
                  </label>
                  <label className="pkg-row">
                    <span className="pkg-label">数量</span>
                    <input className="pkg-input" inputMode="numeric" value={item.quantity} maxLength={2} placeholder="1" onChange={event => updateItem(index, 'quantity', event.target.value)} />
                  </label>
                </div>
              ))}
              <button type="button" className="add-more" onClick={() => setItems(list => (list.length >= 10 ? list : list.concat(emptyItem())))}>
                ＋ 再加一项（最多 10 项）
              </button>
              <div className="switch-line" onClick={() => setAllowSubstitute(!allowSubstitute)} role="button">
                <span>缺货时允许同类替换</span>
                <span className={`switch ${allowSubstitute ? 'on' : ''}`}>{allowSubstitute ? '已开启' : '已关闭'}</span>
              </div>
              <label className="pkg-row">
                <span className="pkg-label">预估金额</span>
                <input className="pkg-input" inputMode="decimal" value={budget} placeholder="选填，便于店主备货" onChange={event => setBudget(event.target.value)} />
              </label>
            </Card>
          )}

          <Card title="送达备注" extra={<span className="card-note">选填</span>}>
            <div className="chip-wrap">
              {QUICK_NOTES.map(text => (
                <Chip key={text} small active={activeNotes.includes(text)} onClick={() => toggleNote(text)}>{text}</Chip>
              ))}
            </div>
            <textarea
              className="textarea"
              rows={3}
              value={note}
              maxLength={100}
              placeholder="也可以自己写，如放门口、稍后电话联系"
              onChange={event => setNote(event.target.value)}
            />
          </Card>

          <section className="fee-card">
            <div className="fee-row">
              <span>{isExpress ? '代取跑腿费' : '代买跑腿费'}</span>
              <span className="fee-value">¥{fee.text}</span>
            </div>
            {fee.detail.map(line => (
              <div key={line.label} className="fee-line"><span>{line.label}</span><span>¥{line.value}</span></div>
            ))}
            <div className="fee-rule">{feeRule}</div>
            {!isExpress ? <div className="fee-rule">商品金额由店主按实际购买报价，确认后再配送</div> : null}
          </section>

          <div className="svc-notes">
            <button type="button" className="svc-note-toggle" onClick={() => setNotesOpen(!notesOpen)}>
              {notesOpen ? '收起服务说明' : '查看服务说明'}
            </button>
            {notesOpen ? (
              <div className="note-list">
                {introduction.rules.map(rule => (
                  <div key={rule.title} className="note-item">
                    <strong>{rule.title}</strong>
                    {rule.description}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button type="button" className="submit-button" onClick={submit} disabled={submitting || !config || !config.enabled}>
            {submitting ? '提交中…' : '提交服务订单'}
          </button>
          <div className="foot-note">线下当面结算 · 服务时间以店铺配置为准</div>
        </>
      ) : null}
    </div>
  );
}
