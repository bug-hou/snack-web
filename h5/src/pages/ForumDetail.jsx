import { useCallback, useEffect, useState } from 'react';
import { NavBar } from '../components/Layout';
import { Message } from '../components/Bits';
import { back } from '../lib/router';
import { invoke } from '../lib/cloud';
import { useCloudImages } from '../lib/useCloudImages';
import { boardName, timeAgo } from '../lib/data';
import { toast, confirm } from '../lib/ui';

function decorateComment(comment) {
  const author = comment.author || '邻居';
  return {
    id: comment.id,
    content: comment.content,
    author,
    initial: author.slice(0, 2),
    timeText: timeAgo(comment.createdAt),
    isMine: !!comment.isMine
  };
}

export default function ForumDetail({ id }) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    if (!id) { setLoading(false); setError('帖子不存在'); return; }
    setLoading(true);
    setError('');
    try {
      const [detail, list] = await Promise.all([
        invoke('getPost', { id }),
        invoke('listComments', { postId: id })
      ]);
      const author = detail.author || '邻居';
      setPost({
        ...detail,
        boardName: boardName(detail.board),
        author,
        initial: author.slice(0, 2),
        timeText: timeAgo(detail.createdAt)
      });
      setComments((list || []).map(decorateComment));
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setError(e.message || '帖子加载失败');
    }
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const resolve = useCloudImages(post ? post.images : []);

  async function toggleLike() {
    if (!post) return;
    try {
      const result = await invoke('toggleLike', { id: post.id });
      setPost(current => ({ ...current, liked: result.liked, likeCount: result.likeCount }));
    } catch (e) {
      toast(e.message || '操作失败');
    }
  }

  async function submitComment() {
    const content = draft.trim();
    if (!content) { toast('请先输入评论内容'); return; }
    if (sending) return;
    setSending(true);
    try {
      const comment = await invoke('createComment', { postId: id, content });
      setComments(list => list.concat(decorateComment(comment)));
      setPost(current => ({ ...current, commentCount: (current.commentCount || 0) + 1 }));
      setDraft('');
    } catch (e) {
      toast(e.message || '评论失败');
    } finally {
      setSending(false);
    }
  }

  async function removeComment(commentId) {
    const ok = await confirm({
      title: '删除评论',
      content: '删除后其他邻居将无法看到这条评论。',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('deleteComment', { id: commentId });
      setComments(list => list.filter(item => item.id !== commentId));
      setPost(current => ({ ...current, commentCount: Math.max(0, (current.commentCount || 0) - 1) }));
    } catch (e) {
      toast(e.message || '删除失败');
    }
  }

  async function removePost() {
    const ok = await confirm({
      title: '删除帖子',
      content: '帖子与全部评论都会被删除，且无法恢复。',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('deletePost', { id });
      toast('已删除');
      back('/forum');
    } catch (e) {
      toast(e.message || '删除失败');
    }
  }

  return (
    <div className="screen screen-padded detail-page detail-with-bar">
      <NavBar title="帖子详情" fallback="/forum" />

      {loading ? <Message>正在加载帖子…</Message> : null}
      {!loading && error ? <Message>{error}</Message> : null}

      {!loading && post ? (
        <>
          <section className="post-main">
            <span className="post-board">{post.boardName}</span>
            <h2 className="post-title">{post.title}</h2>
            <div className="author-row">
              <span className="post-avatar">{post.initial}</span>
              <div className="author-copy">
                <div className="author-name">
                  {post.author}
                  {post.isMine ? <span className="mine-tag">我发布的</span> : null}
                </div>
                <div className="author-time">{post.timeText}</div>
              </div>
            </div>
            <div className="post-content">{post.content}</div>
            {post.images.length ? (
              <div className="post-images">
                {post.images.map(src => {
                  const url = resolve(src);
                  return url ? <img key={src} className="post-image" src={url} alt="" /> : null;
                })}
              </div>
            ) : null}
          </section>

          <div className="action-row">
            <button type="button" className={`like-btn ${post.liked ? 'liked' : ''}`} onClick={toggleLike}>
              {post.liked ? '已赞' : '点赞'} {post.likeCount}
            </button>
            {post.isMine ? <button type="button" className="delete-btn" onClick={removePost}>删除</button> : null}
          </div>

          <div className="comment-head">全部评论 {post.commentCount ? <span>{post.commentCount}</span> : null}</div>

          {!comments.length ? (
            <div className="comment-empty">
              <div className="empty-title">还没有邻居留言</div>
              <div className="empty-copy">友善的一句话，往往能帮上大忙。</div>
            </div>
          ) : null}

          {comments.map(item => (
            <article key={item.id} className="comment-card">
              <div className="comment-top">
                <span className="comment-avatar">{item.initial}</span>
                <div className="comment-copy">
                  <div className="comment-author">{item.author}</div>
                  <div className="comment-time">{item.timeText}</div>
                </div>
                {item.isMine ? (
                  <button type="button" className="comment-del" onClick={() => removeComment(item.id)}>删除</button>
                ) : null}
              </div>
              <div className="comment-body">{item.content}</div>
            </article>
          ))}

          <div className="detail-foot">帖子内容由邻居自行发布，仅代表个人观点。线下见面请选在小区公共区域，注意人身与财物安全。</div>
        </>
      ) : null}

      <div className="comment-bar dock">
        <input
          className="comment-input"
          value={draft}
          maxLength={200}
          placeholder="友善发言，共建邻里氛围"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') submitComment(); }}
        />
        <button type="button" className={`comment-send ${sending ? 'disabled' : ''}`} onClick={submitComment}>
          {sending ? '发送中' : '发送'}
        </button>
      </div>
    </div>
  );
}
