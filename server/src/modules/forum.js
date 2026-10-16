import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { requireText, optionalText, requireHex32, newId, pageOf } from '../core/validate.js';
import {
  FORUM_BOARDS, FORUM_OWNER_BOARDS, FORUM_BOARD_TEXT, FORUM_TITLE_MAX, FORUM_CONTENT_MAX,
  FORUM_COMMENT_MAX, FORUM_IMAGE_MAX, FORUM_PAGE_SIZE, FORUM_DAILY_POSTS,
  FORUM_WINDOW_COMMENTS, FORUM_WINDOW_MS, FORUM_LIKE_CAP, ADMIN_PAGE_SIZE
} from '../core/constants.js';
import { assertImageUrl } from '../services/upload.js';
import { assertClean } from '../services/security.js';
import { forumAlias } from '../core/alias.js';

function viewPost(doc, userId, full) {
  const likedBy = Array.isArray(doc.likedBy) ? doc.likedBy : [];
  return {
    id: doc._id,
    board: doc.board,
    boardText: FORUM_BOARD_TEXT[doc.board] || doc.board,
    title: doc.title,
    content: full ? doc.content : String(doc.content || '').slice(0, 200),
    images: Array.isArray(doc.images) ? doc.images.slice(0, FORUM_IMAGE_MAX) : [],
    author: doc.authorAlias || '邻居',
    likeCount: Number.isSafeInteger(doc.likeCount) ? doc.likeCount : likedBy.length,
    commentCount: Number.isSafeInteger(doc.commentCount) ? doc.commentCount : 0,
    liked: likedBy.includes(userId),
    pinned: doc.pinned === true,
    isMine: doc.authorId === userId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function viewComment(doc, userId) {
  return {
    id: doc._id,
    postId: doc.postId,
    content: doc.content,
    author: doc.authorAlias || '邻居',
    isMine: doc.authorId === userId,
    createdAt: doc.createdAt
  };
}

function forumId(input, label) {
  const id = requireText(input.id, 40, label);
  if (!/^[a-f0-9]{32}$/.test(id)) throw new AppError(`${label}格式不正确`);
  return id;
}

export async function listPosts(userId, input = {}) {
  const raw = input.board;
  const board = raw === undefined || raw === null || raw === '' || raw === 'all'
    ? '' : requireText(raw, 12, '板块');
  if (board && !FORUM_BOARDS.includes(board)) throw new AppError('未找到该板块');

  const page = Number.isSafeInteger(input.page) && input.page >= 0 && input.page < 200 ? input.page : 0;
  const filter = board ? { status: 'approved', board } : { status: 'approved' };

  const list = await col.posts.find(filter)
    .sort({ pinned: -1, createdAt: -1 })
    .skip(page * FORUM_PAGE_SIZE)
    .limit(FORUM_PAGE_SIZE)
    .toArray();
  return list.map((doc) => viewPost(doc, userId, false));
}

export async function getPost(userId, input) {
  const id = forumId(input, '帖子编号');
  const doc = await col.posts.findOne({ _id: id });
  if (!doc) throw new AppError('帖子不存在或已删除');
  if (doc.status !== 'approved' && doc.authorId !== userId) throw new AppError('帖子不存在或已删除');
  return viewPost(doc, userId, true);
}

export async function createPost(userId, input, isAdmin) {
  const board = requireText(input.board, 12, '板块');
  if (!FORUM_BOARDS.includes(board)) throw new AppError('请选择要发布的板块');
  // 公告类内容只由社区管理方发布，避免冒充
  if (FORUM_OWNER_BOARDS.includes(board) && !isAdmin) throw new AppError('社区公告仅由社区管理方发布');

  const title = requireText(input.title, FORUM_TITLE_MAX, '标题');
  const content = requireText(input.content, FORUM_CONTENT_MAX, '正文');

  const images = Array.isArray(input.images) ? input.images.slice(0, FORUM_IMAGE_MAX) : [];
  for (const image of images) assertImageUrl(image, ['forum'], '帖子图片');

  await assertClean(`${title}\n${content}`);

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = await col.posts.countDocuments({ authorId: userId, createdAt: { $gte: since } });
  if (recent >= FORUM_DAILY_POSTS) throw new AppError(`24 小时内最多发布 ${FORUM_DAILY_POSTS} 条帖子`);

  const now = Date.now();
  const doc = {
    _id: newId(),
    board,
    title,
    content,
    images,
    authorId: userId,
    authorAlias: forumAlias(userId),
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    status: 'approved',
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  await col.posts.insertOne(doc);
  return viewPost(doc, userId, true);
}

export async function deletePost(userId, input, isAdmin) {
  const id = forumId(input, '帖子编号');
  const existing = await col.posts.findOne({ _id: id });
  if (!existing) throw new AppError('帖子不存在或已删除');
  if (existing.authorId !== userId && !isAdmin) throw new AppError('只能删除自己发布的帖子');

  await col.posts.deleteOne({ _id: id });
  await col.comments.deleteMany({ postId: id });
  return { id };
}

export async function toggleLike(userId, input) {
  const id = forumId(input, '帖子编号');
  const existing = await col.posts.findOne({ _id: id });
  if (!existing || existing.status !== 'approved') throw new AppError('帖子不存在或已删除');

  const likedBy = Array.isArray(existing.likedBy) ? existing.likedBy : [];
  const liked = likedBy.includes(userId);
  if (!liked && likedBy.length >= FORUM_LIKE_CAP) throw new AppError('点赞人数已达上限');

  const next = liked ? likedBy.filter((item) => item !== userId) : likedBy.concat(userId);
  const result = await col.posts.updateOne(
    { _id: id },
    { $set: { likedBy: next, likeCount: next.length, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('操作失败，请重试');
  return { id, liked: !liked, likeCount: next.length };
}

export async function listComments(userId, input) {
  const postId = forumId({ id: input.postId }, '帖子编号');
  const list = await col.comments.find({ postId, status: 'approved' })
    .sort({ createdAt: 1 }).limit(100).toArray();
  return list.map((doc) => viewComment(doc, userId));
}

export async function createComment(userId, input) {
  const postId = forumId({ id: input.postId }, '帖子编号');
  const content = requireText(input.content, FORUM_COMMENT_MAX, '评论');

  const post = await col.posts.findOne({ _id: postId });
  if (!post || post.status !== 'approved') throw new AppError('帖子不存在或已删除');

  await assertClean(content);

  const since = Date.now() - FORUM_WINDOW_MS;
  const recent = await col.comments.countDocuments({ authorId: userId, createdAt: { $gte: since } });
  if (recent >= FORUM_WINDOW_COMMENTS) throw new AppError('发言有点快，休息一下再试');

  const now = Date.now();
  const doc = {
    _id: newId(),
    postId,
    content,
    authorId: userId,
    authorAlias: forumAlias(userId),
    status: 'approved',
    createdAt: now
  };
  await col.comments.insertOne(doc);
  await col.posts.updateOne({ _id: postId }, { $inc: { commentCount: 1 }, $set: { updatedAt: now } }).catch(() => {});
  return viewComment(doc, userId);
}

export async function deleteComment(userId, input, isAdmin) {
  const id = forumId(input, '评论编号');
  const existing = await col.comments.findOne({ _id: id });
  if (!existing) throw new AppError('评论不存在或已删除');
  if (existing.authorId !== userId && !isAdmin) throw new AppError('只能删除自己的评论');

  await col.comments.deleteOne({ _id: id });
  await col.posts.updateOne({ _id: existing.postId }, { $inc: { commentCount: -1 } }).catch(() => {});
  return { id };
}

/* ---------- 管理端 ---------- */

export async function adminListPosts(input = {}) {
  const page = pageOf(input.page, 100);
  const board = input.board ? requireText(input.board, 12, '板块') : '';
  if (board && !FORUM_BOARDS.includes(board)) throw new AppError('板块不正确');
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase().slice(0, 40) : '';

  const filter = board ? { board } : {};
  const data = await col.posts.find(filter).sort({ createdAt: -1 })
    .skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).toArray();

  let list = data.map((item) => ({ ...item, boardText: FORUM_BOARD_TEXT[item.board] || item.board }));
  if (keyword) {
    list = list.filter((item) => [item.title, item.content, item.authorAlias]
      .some((v) => String(v || '').toLowerCase().includes(keyword)));
  }
  return { list, page, hasMore: data.length === ADMIN_PAGE_SIZE };
}

export async function adminDeletePost(input) {
  const id = requireHex32(input.id, '帖子编号');
  const existing = await col.posts.findOne({ _id: id });
  if (!existing) throw new AppError('帖子不存在或已删除');
  await col.posts.deleteOne({ _id: id });
  await col.comments.deleteMany({ postId: id }).catch(() => {});
  return { id };
}

export async function adminListComments(input) {
  const postId = requireHex32(input.postId, '帖子编号');
  const data = await col.comments.find({ postId }).sort({ createdAt: 1 }).limit(100).toArray();
  return data.map((item) => ({
    id: item._id,
    postId,
    content: item.content,
    author: item.authorAlias || '邻居',
    createdAt: item.createdAt
  }));
}

export async function adminDeleteComment(input) {
  const id = requireHex32(input.id, '评论编号');
  const existing = await col.comments.findOne({ _id: id });
  if (!existing) throw new AppError('评论不存在或已删除');
  await col.comments.deleteOne({ _id: id });
  await col.posts.updateOne({ _id: existing.postId }, { $inc: { commentCount: -1 } }).catch(() => {});
  return { id };
}
