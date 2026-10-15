import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '../cloud';
import { useToast, Chip, Empty, LoadingRow, Modal, Pager, Segmented, SearchBox, Icon, ShotList, useConfirm } from '../ui';
import { FORUM_BOARDS, formatTime } from '../utils';

const BOARD_TABS = [{ value: '', label: '全部板块' }, ...Object.entries(FORUM_BOARDS).map(([v, l]) => ({ value: v, label: l }))];

export default function Posts({ onChanged }) {
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const [data, setData] = useState({ list: [], page: 1, hasMore: false });
  const [board, setBoard] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState(null);
  const ref = React.useRef({ board: '', keyword: '' });
  ref.current = { board, keyword };

  const load = useCallback(async (page = 1, nextBoard = ref.current.board, kw = ref.current.keyword) => {
    setLoading(true);
    try { setData(await invoke('listPosts', { page, board: nextBoard, keyword: kw })); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(1, '', ''); }, [load]);

  async function openComments(post) {
    setComments({ post, list: [], loading: true });
    try {
      const list = await invoke('listComments', { postId: post._id });
      setComments({ post, list, loading: false });
    } catch (e) {
      toast(e.message, 'error');
      setComments(null);
    }
  }

  async function removeComment(id) {
    if (busy || !comments) return;
    setBusy(true);
    try {
      await invoke('deleteComment', { id });
      setComments(prev => ({ ...prev, list: prev.list.filter(c => c.id !== id) }));
      toast('评论已删除');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function removePost(post) {
    const ok = await ask({ title: '删除这条帖子？', message: `「${post.title}」及其评论会被一并删除，无法恢复。`, confirmText: '删除帖子' });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke('deletePost', { id: post._id });
      toast('帖子已删除');
      await load(data.page, board, keyword);
      if (onChanged) onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Community Forum</span>
          <h1>广场管理</h1>
          <p>邻里广场的帖子与评论，遇到不合适的内容可以及时处理。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => load(data.page, board, keyword)} disabled={loading}><Icon name="shares" size={15} />刷新</button>
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={board} options={BOARD_TABS} onChange={v => { setBoard(v); ref.current.board = v; load(1, v, keyword); }} />
        <form onSubmit={e => { e.preventDefault(); ref.current.keyword = keyword; load(1, board, keyword); }} style={{ display: 'contents' }}>
          <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索标题 / 正文" />
        </form>
      </div>

      {loading ? <LoadingRow text="正在加载帖子…" /> : data.list.length === 0
        ? <Empty title="还没有帖子" text="居民在小程序发布后会出现在这里。" />
        : (
          <div className="order-grid">
            {data.list.map(post => (
              <article className="order" key={post._id}>
                <div className="order-head">
                  <div className="order-id">
                    {post.title}
                    <small>{post.author || '邻居'} · {formatTime(post.createdAt)}</small>
                  </div>
                  <div className="order-head-right">
                    <Chip tone="blue">{FORUM_BOARDS[post.board] || post.board}</Chip>
                    <Chip tone="grey">{post.commentCount || 0} 条评论 · {post.likeCount || 0} 赞</Chip>
                  </div>
                </div>
                <div className="order-body">
                  <div className="order-items">
                    <div className="order-line"><span className="pre-wrap">{post.content}</span></div>
                  </div>
                  <div className="order-meta">
                    <strong>帖子图片</strong>
                    <ShotList images={post.images || []} />
                    <span className="user-id">{post.authorOpenid}</span>
                  </div>
                </div>
                <div className="order-foot">
                  <small>发布者昵称：{post.author || '邻居'}</small>
                  <div className="order-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openComments(post)}><Icon name="posts" size={13} />查看评论</button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => removePost(post)}><Icon name="trash" size={13} />删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

      <Pager page={data.page} hasMore={data.hasMore} busy={loading}
        onPrev={() => load(Math.max(1, data.page - 1), board, keyword)} onNext={() => load(data.page + 1, board, keyword)} />

      {comments && (
        <Modal
          title={`《${comments.post.title}》的评论`}
          subtitle={`共 ${comments.list.length} 条`}
          onClose={() => setComments(null)}
          footer={<button className="btn btn-ghost" onClick={() => setComments(null)}>关闭</button>}
        >
          {comments.loading ? <LoadingRow text="正在加载评论…" /> : comments.list.length === 0
            ? <Empty title="还没有评论" />
            : (
              <div className="stack">
                {comments.list.map(c => (
                  <div className="card card-pad" key={c.id} style={{ padding: '12px 14px' }}>
                    <div className="row-between">
                      <strong className="small">{c.author || '邻居'}</strong>
                      <div className="row">
                        <span className="small muted">{formatTime(c.createdAt)}</span>
                        <button className="btn-link danger small" disabled={busy} onClick={() => removeComment(c.id)}>删除</button>
                      </div>
                    </div>
                    <div className="small pre-wrap" style={{ marginTop: 4 }}>{c.content}</div>
                  </div>
                ))}
              </div>
            )}
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
