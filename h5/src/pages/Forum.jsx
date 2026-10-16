import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { PageHeader } from '../components/Layout';
import { EmptyState, Message, SkeletonList } from '../components/Bits';
import { navigate } from '../lib/router';
import { invoke } from '../lib/cloud';
import { BOARDS, boardName, excerpt, timeAgo } from '../lib/data';
import { useCloudImages } from '../lib/useCloudImages';

const PAGE_SIZE = 15;

function decorate(post) {
  const author = post.author || '邻居';
  return {
    id: post.id,
    title: post.title,
    excerpt: excerpt(post.content),
    images: post.images || [],
    author,
    initial: author.slice(0, 2),
    boardName: boardName(post.board),
    pinned: !!post.pinned,
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    timeText: timeAgo(post.createdAt)
  };
}

export default function Forum() {
  const [board, setBoard] = useState('all');
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (reset) => {
    if (reset) {
      setLoading(!posts.length);
      setError('');
    } else {
      setLoadingMore(true);
    }
    const target = reset ? 0 : page;
    try {
      const list = await invoke('listPosts', { board, page: target }) || [];
      const decorated = list.map(decorate);
      setPosts(current => (reset ? decorated : current.concat(decorated)));
      setPage(target + 1);
      setHasMore(list.length >= PAGE_SIZE);
      setLoading(false);
      setLoadingMore(false);
      setError('');
    } catch (e) {
      setLoading(false);
      setLoadingMore(false);
      if (reset) setError(e.message || '广场暂时无法访问');
    }
  }, [board, page, posts.length]);

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [board]);

  const images = useMemo(() => posts.flatMap(post => post.images), [posts]);
  const resolve = useCloudImages(images);

  return (
    <div className="screen screen-tabbed forum-page">
      <PageHeader
        title="邻里广场"
        sub="闲聊 · 互助求助 · 失物招领 · 社区公告"
        right={<button type="button" className="page-head-link" onClick={() => navigate('/forum/new')}>发布</button>}
      />

      <div className="chip-scroll">
        {BOARDS.map(item => (
          <button
            key={item.id}
            type="button"
            className={`chip ${board === item.id ? 'selected' : ''}`}
            onClick={() => setBoard(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="forum-notice">广场只做邻里信息交流：请勿发布交易、广告、二维码或个人联系方式。违规内容会被下架。</div>

      {loading ? <SkeletonList count={4} kind="row" /> : null}
      {!loading && error ? <Message onClick={() => load(true)}>{error} · 点击重试</Message> : null}
      {!loading && !error && !posts.length ? (
        <div className="forum-empty">
          <div className="empty-art"><Icon name="repeat" size={22} /></div>
          <div className="empty-title">这个板块还很安静</div>
          <div className="empty-copy">发一条帖子，让邻居先认识你。</div>
          <button type="button" className="primary-action" onClick={() => navigate('/forum/new')}>发布第一条　→</button>
        </div>
      ) : null}

      {!loading && posts.length ? posts.map(item => (
        <article key={item.id} className="post-card" onClick={() => navigate(`/forum/${item.id}`)} role="button">
          <div className="post-top">
            <span className="post-board">{item.boardName}</span>
            {item.pinned ? <span className="post-pin">置顶</span> : null}
          </div>
          <div className="post-title">{item.title}</div>
          {item.excerpt ? <div className="post-excerpt">{item.excerpt}</div> : null}
          {item.images.length ? (
            <div className="post-thumbs">
              {item.images.map(src => {
                const url = resolve(src);
                return url
                  ? <img key={src} className="post-thumb" src={url} alt="" loading="lazy" />
                  : <span key={src} className="post-thumb" />;
              })}
            </div>
          ) : null}
          <div className="post-foot">
            <div className="post-author">
              <span className="post-avatar">{item.initial}</span>
              <span>{item.author}</span>
            </div>
            <div className="post-meta">
              <span>{item.timeText}</span>
              <span className="meta-dot">·</span>
              <span>赞 {item.likeCount}</span>
              <span className="meta-dot">·</span>
              <span>评论 {item.commentCount}</span>
            </div>
          </div>
        </article>
      )) : null}

      {!loading && posts.length ? (
        loadingMore
          ? <Message>正在加载更多…</Message>
          : hasMore
            ? <button type="button" className="more-button" onClick={() => load(false)}>加载更多</button>
            : <Message>没有更多帖子了</Message>
      ) : null}
    </div>
  );
}
