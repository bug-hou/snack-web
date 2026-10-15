import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { NavBar } from '../components/Layout';
import { Message } from '../components/Bits';
import { navigate } from '../lib/router';
import { invoke } from '../lib/cloud';
import { useCloudImages } from '../lib/useCloudImages';
import { money } from '../lib/data';

const TABS = [{ id: 'all', name: '邻里闲置' }, { id: 'mine', name: '我的发布' }];
const TONES = ['peach', 'sage', 'butter'];

export default function Shares() {
  const [scope, setScope] = useState('all');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await invoke('listShares', { scope });
      setList(raw.map((item, index) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        conditionText: item.conditionText,
        modeText: item.modeText,
        priceText: item.mode === 'sale' ? `¥${money(item.priceCents)}` : '免费分享',
        meetup: item.meetup,
        statusText: item.statusText,
        isMine: item.isMine,
        cover: item.images && item.images.length ? item.images[0] : '',
        initials: (item.title || '闲置').slice(0, 2),
        tone: TONES[index % TONES.length]
      })));
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setError(e.message || '加载失败，请稍后重试');
    }
  }, [scope]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const resolve = useCloudImages(list.map(item => item.cover));

  return (
    <div className="screen screen-padded share-page">
      <NavBar title="邻里闲置" fallback="/" />
      <div className="share-head">
        <div className="share-title">邻里闲置</div>
        <div className="share-sub">二手转让，也可以免费送给邻居</div>
      </div>

      <div className="scope-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`scope-tab ${scope === tab.id ? 'current' : ''}`}
            onClick={() => setScope(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {loading ? <Message>正在加载物品…</Message> : null}
      {!loading && error ? <Message onClick={loadShares}>{error} · 点击重试</Message> : null}
      {!loading && !error && !list.length ? (
        <div className="share-empty">
          <div className="empty-title">{scope === 'mine' ? '还没有发布过物品' : '还没有邻居发布闲置'}</div>
          <div className="empty-copy">
            {scope === 'mine' ? '把家里用不上的好物拍张照，就能分享给邻居。' : '成为第一个分享的人吧，闲置也可以在小区里接力。'}
          </div>
          <button type="button" className="primary-action" onClick={() => navigate('/shares/new')}>发布闲置　→</button>
        </div>
      ) : null}

      {!loading && list.length ? list.map(item => {
        const cover = resolve(item.cover);
        return (
          <article key={item.id} className="item-card" onClick={() => navigate(`/shares/${item.id}`)} role="button">
            <div className={`item-art tone-${item.tone}`}>
              {cover ? <img className="item-image" src={cover} alt={item.title} loading="lazy" /> : item.initials}
            </div>
            <div className="item-body">
              <div className="item-title">{item.title}</div>
              <div className="item-tags">
                <span className="tag mode">{item.modeText}</span>
                <span className="tag">{item.conditionText}</span>
                {item.isMine ? <span className="tag mine">{item.statusText}</span> : null}
              </div>
              <div className="item-desc">{item.description}</div>
              <div className="item-foot">
                <span className="item-price">{item.priceText}</span>
                <span className="item-meetup">{item.meetup}</span>
              </div>
            </div>
          </article>
        );
      }) : null}

      <button type="button" className="publish-button dock" onClick={() => navigate('/shares/new')}>
        <Icon name="plus" size={15} />
        <span>发布闲置　→</span>
      </button>
    </div>
  );
}
