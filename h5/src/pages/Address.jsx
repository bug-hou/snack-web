import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Chip, Message, Spinner } from '../components/Bits';
import { back } from '../lib/router';
import { invoke } from '../lib/cloud';
import { getAddresses, selectAddress } from '../lib/shop';
import { toast, confirm } from '../lib/ui';
import { BUILDINGS, CONTACT_TEXT, PREFERENCES } from '../lib/data';
import { prefs, savePrefs } from '../lib/prefs';

/** 预填上次用过的联系人与偏好，新增地址时基本只需要选楼栋和填门牌 */
function emptyForm() {
  const saved = prefs();
  return {
    id: '',
    label: '家',
    recipient: saved.recipient,
    phone: saved.phone,
    building: saved.building,
    room: '',
    contactPreference: saved.contactPreference,
    pickupPhoneLast4: ''
  };
}

export default function Address({ from = '' }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [moreOpen, setMoreOpen] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAddresses();
      setList(result.list.map(item => ({ ...item, contactText: CONTACT_TEXT[item.contactPreference] || '' })));
      setSelectedId(result.selected ? result.selected.id : '');
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setError(e.message || '地址加载失败，请重试');
    }
  }, []);

  useEffect(() => { loadAddresses(); }, [loadAddresses]);

  function update(key, value) { setForm(current => ({ ...current, [key]: value })); }

  function choose(id) {
    selectAddress(id);
    setSelectedId(id);
    if (from) back();
    else toast('已设为常用地址');
  }

  function edit(address) {
    setEditing(true);
    setForm({ ...emptyForm(), ...address });
    setError('');
  }

  async function save() {
    if (saving) return;
    if (!form.recipient.trim() || !/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      setError('请填写姓名和正确的手机号码');
      return;
    }
    if (!BUILDINGS.includes(form.building) || !/^[0-9A-Za-z\u4e00-\u9fa5-]{1,20}$/.test(form.room.trim())) {
      setError('请选择楼栋并填写门牌号');
      return;
    }
    // 取件尾号默认取手机号后四位，用户不必再填一次
    const tail = (form.pickupPhoneLast4 || '').trim() || String(form.phone.trim()).slice(-4);
    if (tail && !/^\d{4}$/.test(tail)) {
      setError('取件手机尾号需为4位数字');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await invoke('saveAddress', {
        ...form,
        recipient: form.recipient.trim(),
        phone: form.phone.trim(),
        room: form.room.trim(),
        pickupPhoneLast4: tail
      });
      selectAddress(saved.id);
      savePrefs({
        recipient: saved.recipient || form.recipient.trim(),
        phone: saved.phone || form.phone.trim(),
        contactPreference: saved.contactPreference || form.contactPreference,
        building: saved.building || form.building
      });
      setEditing(false);
      setForm(emptyForm());
      setMoreOpen(false);
      await loadAddresses();
      if (from) back();
      else toast('地址已保存');
    } catch (e) {
      setError(e.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function removeAddress(id) {
    const ok = await confirm({
      title: '删除地址',
      content: '确定删除这条收货地址吗？已提交的订单不会受到影响。',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('deleteAddress', { id });
      if (selectedId === id) selectAddress('');
      await loadAddresses();
    } catch (e) {
      toast(e.message || '删除失败');
    }
  }

  return (
    <div className="screen screen-padded address-page">
      <PageHeader title="我的收货地址" sub="保利爱尚里 · 仅支持 16 / 17 / 18 栋" />

      {error ? <Message onClick={editing ? undefined : loadAddresses}>{error}{editing ? '' : ' · 点击重试'}</Message> : null}
      {loading ? <Spinner label="正在加载地址…" /> : null}

      {!loading && !editing ? (
        <>
          {list.map(item => (
            <article key={item.id} className={`address-card ${selectedId === item.id ? 'active' : ''}`}>
              <button type="button" className="address-main" onClick={() => choose(item.id)}>
                <span className="address-top">
                  <span className="address-tag">{item.label}</span>
                  {selectedId === item.id ? <span className="default-tag">当前使用</span> : null}
                </span>
                <span className="address-line-title">{item.building}栋 {item.room}</span>
                <span className="address-person">{item.recipient}　{item.phone}</span>
                {item.pickupPhoneLast4 ? <span className="address-person">取件手机尾号 {item.pickupPhoneLast4}</span> : null}
              </button>
              <div className="address-actions">
                <button type="button" className="action" onClick={() => edit(item)}>编辑</button>
                <button type="button" className="action danger" onClick={() => removeAddress(item.id)}>删除</button>
              </div>
            </article>
          ))}
          {!list.length ? <div className="message-line">还没有收货地址，添加一次后登记就不用重复填写啦。</div> : null}
          <button
            type="button"
            className="add-button"
            onClick={() => { setEditing(true); setForm(emptyForm()); setError(''); }}
          >
            ＋ 新增收货地址
          </button>
        </>
      ) : null}

      {!loading && editing ? (
        <section className="form-card">
          <div className="form-title">{form.id ? '编辑收货地址' : '新增收货地址'}</div>

          <label className="field">
            <span className="field-label">收货人</span>
            <input className="input" maxLength={30} placeholder="请输入收货人姓名" value={form.recipient} onChange={e => update('recipient', e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">手机号码</span>
            <input className="input" inputMode="numeric" maxLength={11} placeholder="请输入手机号" value={form.phone} onChange={e => update('phone', e.target.value)} />
            {form.phone.length === 11 && !/^1[3-9]\d{9}$/.test(form.phone) ? (
              <span className="field-error">手机号格式看起来不对，请检查一下</span>
            ) : null}
          </label>

          <div className="option-title">选择楼栋</div>
          <div className="options">
            {BUILDINGS.map(item => (
              <Chip key={item} active={form.building === item} onClick={() => update('building', item)}>{item}栋</Chip>
            ))}
          </div>

          <label className="field">
            <span className="field-label">门牌号</span>
            <input className="input" maxLength={20} placeholder="如 1201" value={form.room} onChange={e => update('room', e.target.value)} />
          </label>

          <div className="option-title">送达时如何联系您？</div>
          <div className="options">
            {PREFERENCES.map(item => (
              <Chip key={item.value} active={form.contactPreference === item.value} onClick={() => update('contactPreference', item.value)}>
                {item.label}
              </Chip>
            ))}
          </div>

          <div className="more-block">
            <button type="button" className="more-toggle" onClick={() => setMoreOpen(!moreOpen)}>
              {moreOpen ? '收起选填项' : '选填：地址标签、取件尾号'}
            </button>
            {moreOpen ? (
              <div className="more-body">
                <label className="field">
                  <span className="field-label">地址标签</span>
                  <input className="input" maxLength={12} placeholder="如 家 / 父母家" value={form.label} onChange={e => update('label', e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">取件手机尾号</span>
                  <input className="input" inputMode="numeric" maxLength={4} placeholder="默认同手机号后四位" value={form.pickupPhoneLast4} onChange={e => update('pickupPhoneLast4', e.target.value)} />
                </label>
                <div className="field">
                  <span className="field-label">小区</span>
                  <span className="fixed">保利爱尚里</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="form-actions">
            <button type="button" className="cancel" onClick={() => { setEditing(false); setForm(emptyForm()); setError(''); }}>取消</button>
            <button type="button" className="save" onClick={save}>{saving ? '保存中…' : '保存并使用'}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
