import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Message } from '../components/Bits';
import { back } from '../lib/router';
import { invoke } from '../lib/cloud';
import { useCloudImages } from '../lib/useCloudImages';
import { money } from '../lib/data';
import { toast, confirm } from '../lib/ui';

export default function ShareDetail({ id }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await invoke('getShare', { id });
      setItem({ ...detail, price: money(detail.priceCents) });
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setError(e.message || '加载失败，请重试');
    }
  }, [id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const resolve = useCloudImages(item && item.images ? item.images : []);

  async function changeStatus(status, tip) {
    const ok = await confirm({ title: '确认操作', content: tip, confirmText: '确定' });
    if (!ok) return;
    try {
      await invoke('updateShare', { id, status });
      toast('已更新');
      loadDetail();
    } catch (e) {
      toast(e.message || '操作失败');
    }
  }

  return (
    <div className="screen screen-padded detail-page">
      <PageHeader title="物品详情" />

      {loading ? <Message>正在加载物品…</Message> : null}
      {!loading && error ? <Message onClick={loadDetail}>{error} · 点击重试</Message> : null}

      {!loading && item ? (
        <>
          {item.images.length ? (
            <div className="gallery">
              {item.images.map(src => {
                const url = resolve(src);
                return url ? <img key={src} className="gallery-image" src={url} alt={item.title} /> : null;
              })}
            </div>
          ) : <div className="gallery-empty">暂无图片</div>}

          <section className="info-card">
            <div className="info-title">{item.title}</div>
            <div className="info-price">{item.mode === 'sale' ? `¥${item.price}` : '免费分享'}</div>
            <div className="info-tags">
              <span className="tag">{item.conditionText}</span>
              <span className="tag mode">{item.modeText}</span>
              {item.isMine ? <span className="tag mine">{item.statusText}</span> : null}
            </div>
            <div className="info-desc">{item.description}</div>
          </section>

          <section className="info-card">
            <div className="row">
              <span className="row-label">交接地点</span>
              <span className="row-value">{item.meetup}</span>
            </div>
            <div className="tip">建议在白天的小区公共区域当面交接，并当场检查物品。</div>
          </section>

          {item.isMine ? (
            <div className="owner-actions">
              <button type="button" className="ghost-btn" onClick={() => changeStatus('off', '下架后其他邻居将看不到这件物品。')}>下架</button>
              <button type="button" className="ghost-btn" onClick={() => changeStatus('taken', '标记为已转出后，物品将从邻里闲置列表中移除。')}>已转出</button>
              {item.status !== 'pending' && item.status !== 'approved' ? (
                <button type="button" className="ghost-btn" onClick={() => changeStatus('approved', '重新上架后立即对邻居公开，确认吗？')}>重新上架</button>
              ) : null}
            </div>
          ) : null}

          {item.isMine && item.rejectReason ? <div className="notice-card">未通过原因：{item.rejectReason}</div> : null}

          <div className="foot-note">分享只包含物品公开信息，不会展示联系方式。</div>
        </>
      ) : null}
    </div>
  );
}
