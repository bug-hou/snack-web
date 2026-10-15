import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '../cloud';
import { useToast, Chip, Empty, LoadingRow, Pager, Segmented, Icon, ShotList, useConfirm } from '../ui';
import { SHARE_STATUS, SHARE_CONDITION, SHARE_MODE, yuan, formatTime } from '../utils';

const TABS = [
  { value: '', label: '全部' },
  { value: 'approved', label: '已公开' },
  { value: 'off', label: '已下架' },
  { value: 'taken', label: '已转出' }
];
const TONE = { approved: 'green', off: 'grey', taken: 'blue', pending: 'amber', rejected: 'red' };

export default function Shares({ onChanged }) {
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const [data, setData] = useState({ list: [], page: 1, hasMore: false });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const filterRef = React.useRef('');
  filterRef.current = status;

  const load = useCallback(async (page = 1, nextStatus = filterRef.current) => {
    setLoading(true);
    try { setData(await invoke('listShares', { page, status: nextStatus })); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(1, ''); }, [load]);

  async function setItemState(item, next) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke('reviewShare', { id: item._id, status: next, reason: next === 'off' ? '店主下架' : '' });
      toast(next === 'approved' ? '已恢复公开' : '已下架');
      await load(data.page, status);
      if (onChanged) onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    const ok = await ask({ title: '删除这条闲置？', message: `「${item.title}」将被彻底删除，无法恢复。`, confirmText: '删除' });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke('deleteShare', { id: item._id });
      toast('已删除');
      await load(data.page, status);
      if (onChanged) onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Neighbour Shares</span>
          <h1>闲置管理</h1>
          <p>邻居发布后立即公开，遇到不合适的内容可随时下架或删除。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => load(data.page, status)} disabled={loading}><Icon name="shares" size={15} />刷新</button>
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={status} options={TABS} onChange={v => { setStatus(v); filterRef.current = v; load(1, v); }} />
      </div>

      {loading ? <LoadingRow text="正在加载闲置…" /> : data.list.length === 0
        ? <Empty title="还没有邻居发布闲置" text="居民在小程序发布后会出现在这里。" />
        : (
          <div className="order-grid">
            {data.list.map(item => (
              <article className="order" key={item._id}>
                <div className="order-head">
                  <div className="order-id">
                    {item.title}
                    <small>{formatTime(item.createdAt)} · {item.meetup}</small>
                  </div>
                  <div className="order-head-right">
                    <Chip tone={item.mode === 'sale' ? 'amber' : 'green'}>{SHARE_MODE[item.mode] || item.mode}</Chip>
                    <Chip tone={TONE[item.status] || 'grey'}>{SHARE_STATUS[item.status] || item.status}</Chip>
                  </div>
                </div>
                <div className="order-body">
                  <div className="order-items">
                    <div className="order-line"><span className="pre-wrap">{item.description}</span></div>
                    <div className="order-sum">
                      <div className="order-sum-row"><span>成色</span><span>{SHARE_CONDITION[item.condition] || item.condition}</span></div>
                      <div className="order-sum-row"><span>交接地点</span><span>{item.meetup}</span></div>
                      <div className="order-sum-row total"><span>{item.mode === 'sale' ? '转让价' : '分享方式'}</span><span>{item.mode === 'sale' ? yuan(item.priceCents) : '免费赠送'}</span></div>
                    </div>
                  </div>
                  <div className="order-meta">
                    <strong>物品图片</strong>
                    <ShotList images={item.images || []} />
                    <span className="user-id">{item.ownerOpenid}</span>
                    {item.rejectReason && <div className="note">备注：{item.rejectReason}</div>}
                  </div>
                </div>
                <div className="order-foot">
                  <small>{item.status === 'approved' ? '当前对邻居可见' : '当前对邻居不可见'}</small>
                  <div className="order-actions">
                    {item.status === 'approved'
                      ? <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => setItemState(item, 'off')}>下架</button>
                      : <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setItemState(item, 'approved')}>恢复公开</button>}
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove(item)}><Icon name="trash" size={13} />删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

      <Pager page={data.page} hasMore={data.hasMore} busy={loading}
        onPrev={() => load(Math.max(1, data.page - 1), status)} onNext={() => load(data.page + 1, status)} />

      {confirmDialog}
    </div>
  );
}
