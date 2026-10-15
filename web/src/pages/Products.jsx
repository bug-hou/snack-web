import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS, invoke, uploadProductImage, IMAGE_MAX_BYTES } from '../cloud';
import {
  useToast, Chip, Empty, LoadingRow, Modal, Field, Switch, Icon, useConfirm, Segmented, SearchBox, SmartImage
} from '../ui';
import { CATEGORIES, TONES, PRESET_IMAGES, yuan, toCents, centsToInput, formatTime } from '../utils';

const BLANK = { name: '', spec: '', category: 'fresh', price: '', label: '', tone: 'peach', image: '', featured: false, is_available: true };
const PRESET_OPTIONS = Object.entries(PRESET_IMAGES).map(([path, label]) => ({ path, fileID: ASSETS[path] || path, label }));

function ImageUploader({ value, onChange, onError }) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const resolved = ASSETS[value] || value;
  const isPreset = PRESET_OPTIONS.some(opt => opt.fileID === value);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const fileID = await uploadProductImage(file, p => setProgress(p));
      onChange(fileID);
    } catch (error) {
      if (onError) onError(error.message || '图片上传失败');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      className={`uploader${dragging ? ' drag' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
    >
      <div className="uploader-preview">
        {resolved
          ? <SmartImage src={resolved} alt="商品图片" fallback={<span>加载中</span>} />
          : <span>暂无图片</span>}
      </div>
      <div className="uploader-copy grow">
        <div className="uploader-ops">
          <button type="button" className="btn btn-primary btn-sm" disabled={uploading} onClick={() => inputRef.current && inputRef.current.click()}>
            <Icon name="image" size={14} />{uploading ? '上传中…' : '选择图片'}
          </button>
          {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>移除图片</button>}
          {isPreset && <Chip tone="green">预设图</Chip>}
        </div>
        {uploading
          ? <div className="progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          : <small>支持 JPG / PNG / WebP / HEIC（自动转换），原图最大 {IMAGE_MAX_BYTES / 1024 / 1024}MB，会自动压缩后上传</small>}
        <small className="muted">也可以直接把图片拖到这里</small>
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => { const file = e.target.files && e.target.files[0]; e.target.value = ''; handleFile(file); }}
      />
    </div>
  );
}

export default function Products({ onChanged }) {
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('all');
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await invoke('getProducts')); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const visible = list.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const kw = keyword.trim().toLowerCase();
    if (!kw) return true;
    return [item.name, item.spec, item.label].some(v => String(v || '').toLowerCase().includes(kw));
  });

  async function save() {
    if (busy || !editor) return;
    const name = String(editor.name || '').trim();
    const spec = String(editor.spec || '').trim();
    const priceCents = toCents(editor.price);
    if (!name) { setError('请填写商品名称'); return; }
    if (!spec) { setError('请填写规格说明，例如「6 枚装」'); return; }
    if (!Number.isSafeInteger(priceCents) || priceCents < 1) { setError('请填写大于 0 的价格'); return; }
    setBusy(true); setError('');
    try {
      await invoke('saveProduct', {
        id: editor.id || undefined,
        name, spec, category: editor.category, priceCents,
        label: String(editor.label || '').trim(),
        tone: editor.tone || 'peach',
        image: editor.image || '',
        featured: !!editor.featured,
        is_available: !!editor.is_available
      });
      toast(editor.id ? '商品已更新' : '商品已上架');
      setEditor(null);
      await load();
      if (onChanged) onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleAvailable(item) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke('saveProduct', {
        id: item._id, name: item.name, spec: item.spec || '常规规格', category: item.category,
        priceCents: item.priceCents, label: item.label || '', tone: item.tone || 'peach',
        image: item.image || '', featured: !!item.featured, is_available: !item.is_available
      });
      toast(item.is_available ? '已下架，小程序不再展示' : '已上架，小程序立即可见');
      await load();
      if (onChanged) onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    const ok = await ask({
      title: '删除这件商品？',
      message: `「${item.name}」将被归档，小程序不再展示；历史订单中的记录仍会保留。`,
      confirmText: '删除商品'
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke('deleteProduct', { id: item._id });
      toast('商品已删除');
      await load();
      if (onChanged) onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Shelf Management</span>
          <h1>商品管理</h1>
          <p>调整价格、图片与上架状态，保存后小程序立刻同步。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => { setEditor({ ...BLANK }); setError(''); }}>
            <Icon name="plus" size={15} />新增商品
          </button>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索商品名称 / 规格 / 标签" />
        <Segmented
          value={category}
          options={[{ value: 'all', label: '全部分类' }, ...Object.entries(CATEGORIES).map(([v, l]) => ({ value: v, label: l }))]}
          onChange={setCategory}
        />
        <span className="small muted nowrap">共 {visible.length} 件</span>
      </div>

      {loading ? <LoadingRow text="正在加载商品…" /> : visible.length === 0
        ? <Empty title={list.length ? '没有匹配的商品' : '还没有商品'} text={list.length ? '换个关键词试试。' : '上架第一件商品，顾客就能在小程序下单了。'} />
        : (
          <div className="product-grid">
            {visible.map(item => (
              <div className={`product-card${item.is_available ? '' : ' off'}`} key={item._id}>
                <div className="product-shot">
                  {item.image
                    ? <SmartImage src={item.image} alt={item.name} fallback={<span className="fallback">{item.initials || String(item.name || '').slice(0, 2)}</span>} />
                    : <span className="fallback">{item.initials || String(item.name || '').slice(0, 2)}</span>}
                  <div className="flags">
                    {item.featured && <Chip tone="amber">首页推荐</Chip>}
                    <Chip tone={item.is_available ? 'green' : 'grey'}>{item.is_available ? '已上架' : '已下架'}</Chip>
                  </div>
                </div>
                <div className="product-card-body">
                  <strong>{item.name}</strong>
                  <span className="spec">{CATEGORIES[item.category] || item.category}{item.spec ? ` · ${item.spec}` : ''}</span>
                  <div className="product-card-row">
                    <span className="money">{yuan(item.priceCents)}</span>
                    {item.label && <Chip tone="blue">{item.label}</Chip>}
                  </div>
                </div>
                <div className="product-card-ops">
                  <button className="btn btn-ghost btn-sm grow" onClick={() => { setEditor({ ...item, id: item._id, price: centsToInput(item.priceCents) }); setError(''); }}>
                    <Icon name="pencil" size={13} />编辑
                  </button>
                  <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => toggleAvailable(item)}>
                    {item.is_available ? '下架' : '上架'}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove(item)} aria-label="删除">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      {editor && (
        <Modal
          title={editor.id ? '编辑商品' : '上架新商品'}
          subtitle={editor.id ? `商品编号 ${editor.id} · 更新于 ${formatTime(editor.updatedAt)}` : '填写商品信息并上传图片，保存后小程序立即展示'}
          onClose={() => setEditor(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditor(null)}>取消</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存商品'}</button>
          </>}
        >
          {error && <div className="alert error"><div className="grow">{error}</div></div>}

          <div className="grid-2">
            <Field label="商品名称 *">
              <input className="input" maxLength={40} value={editor.name} placeholder="例如：土鸡蛋"
                onChange={e => setEditor({ ...editor, name: e.target.value })} />
            </Field>
            <Field label="规格说明 *" hint="展示在商品名下方，如「6 枚装」">
              <input className="input" maxLength={60} value={editor.spec || ''} placeholder="例如：6 枚装"
                onChange={e => setEditor({ ...editor, spec: e.target.value })} />
            </Field>
            <Field label="分类">
              <select className="select" value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </Field>
            <Field label="价格（元） *">
              <input className="input" type="number" min="0.01" max="10000" step="0.01" value={editor.price}
                onChange={e => setEditor({ ...editor, price: e.target.value })} />
            </Field>
            <Field label="展示标签" hint="可选，最多 12 字">
              <input className="input" maxLength={12} value={editor.label || ''} placeholder="例如：日常必备"
                onChange={e => setEditor({ ...editor, label: e.target.value })} />
            </Field>
            <Field label="卡片色系">
              <select className="select" value={editor.tone || 'peach'} onChange={e => setEditor({ ...editor, tone: e.target.value })}>
                {TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <Field label="商品图片" hint="上传后自动压缩；也可以直接使用内置预设图">
            <ImageUploader value={editor.image || ''} onChange={fileID => setEditor(prev => ({ ...prev, image: fileID }))} onError={setError} />
          </Field>

          <div className="grid-2">
            <Field label="预设图">
              <select
                className="select"
                value={PRESET_OPTIONS.find(opt => opt.fileID === editor.image) ? editor.image : ''}
                onChange={e => setEditor({ ...editor, image: e.target.value })}
              >
                <option value="">不使用预设图</option>
                {PRESET_OPTIONS.map(opt => <option key={opt.fileID} value={opt.fileID}>{opt.label}</option>)}
              </select>
            </Field>
            <div className="field">
              <label>展示设置</label>
              <div className="row" style={{ height: '100%' }}>
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={!!editor.is_available} onChange={e => setEditor({ ...editor, is_available: e.target.checked })} />
                  上架销售
                </label>
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={!!editor.featured} onChange={e => setEditor({ ...editor, featured: e.target.checked })} />
                  首页推荐
                </label>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
