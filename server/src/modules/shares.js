import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { requireText, requireHex32, newId, money, pageOf } from '../core/validate.js';
import { SHARE_CONDITIONS, SHARE_MODES, SHARE_STATUS, SHARE_LIMIT, ADMIN_PAGE_SIZE } from '../core/constants.js';
import { assertImageUrl } from '../services/upload.js';
import { assertClean } from '../services/security.js';

function viewShare(doc, mine) {
  const priceCents = Number.isSafeInteger(doc.priceCents) ? doc.priceCents : 0;
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    condition: doc.condition,
    conditionText: SHARE_CONDITIONS[doc.condition] || doc.condition,
    mode: doc.mode,
    modeText: SHARE_MODES[doc.mode] || doc.mode,
    priceCents,
    price: money(priceCents),
    images: Array.isArray(doc.images) ? doc.images.slice(0, 3) : [],
    meetup: doc.meetup,
    status: doc.status,
    statusText: SHARE_STATUS[doc.status] || doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isMine: !!mine,
    rejectReason: mine ? doc.rejectReason || '' : ''
  };
}

export async function listShares(userId, input = {}) {
  const scope = input.scope === 'mine' ? 'mine' : 'all';
  if (scope === 'mine') {
    const list = await col.shares.find({ ownerId: userId }).sort({ updatedAt: -1 }).limit(30).toArray();
    return list.map((doc) => viewShare(doc, true));
  }
  const list = await col.shares.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(50).toArray();
  return list.map((doc) => viewShare(doc, doc.ownerId === userId));
}

export async function getShare(userId, input) {
  const id = requireHex32(input.id, '物品编号');
  const doc = await col.shares.findOne({ _id: id });
  if (!doc) throw new AppError('物品不存在或已下架');
  const mine = doc.ownerId === userId;
  if (doc.status !== 'approved' && !mine) throw new AppError('物品不存在或已下架');
  return viewShare(doc, mine);
}

export async function createShare(userId, input) {
  const title = requireText(input.title, 40, '物品名称');
  const description = requireText(input.description, 200, '物品描述');

  const condition = requireText(input.condition, 10, '成色');
  if (!SHARE_CONDITIONS[condition]) throw new AppError('请选择物品成色');

  const mode = requireText(input.mode, 10, '分享方式');
  if (!SHARE_MODES[mode]) throw new AppError('请选择分享方式');

  const meetup = requireText(input.meetup, 40, '交接地点');

  let priceCents = 0;
  if (mode === 'sale') {
    priceCents = input.priceCents;
    if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 1000000) {
      throw new AppError('请填写有效的转让价格');
    }
  }

  const images = Array.isArray(input.images) ? input.images.slice(0, 3) : [];
  if (images.length > 3) throw new AppError('最多上传3张图片');
  for (const image of images) assertImageUrl(image, ['community'], '物品图片');

  await assertClean(`${title}\n${description}`);

  const total = await col.shares.countDocuments({ ownerId: userId });
  if (total >= SHARE_LIMIT) throw new AppError(`最多发布${SHARE_LIMIT}件物品，请先下架不再分享的物品`);

  const now = Date.now();
  // 发布即公开，不再需要店主审核；违规内容由管理端下架
  const doc = {
    _id: newId(),
    ownerId: userId,
    title,
    description,
    condition,
    mode,
    priceCents,
    images,
    meetup,
    status: 'approved',
    createdAt: now,
    updatedAt: now
  };
  await col.shares.insertOne(doc);
  return viewShare(doc, true);
}

export async function updateShare(userId, input) {
  const id = requireHex32(input.id, '物品编号');
  const status = requireText(input.status, 10, '物品状态');
  if (!['approved', 'off', 'taken'].includes(status)) throw new AppError('不支持的物品状态');

  const existing = await col.shares.findOne({ _id: id });
  if (!existing || existing.ownerId !== userId) throw new AppError('物品不存在');

  const result = await col.shares.updateOne(
    { _id: id, ownerId: userId },
    { $set: { status, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('更新失败，请重试');
  return { id, status };
}

/* ---------- 管理端 ---------- */

export async function adminListShares(input = {}) {
  const page = pageOf(input.page, 100);
  const status = input.status ? requireText(input.status, 20, '物品状态') : '';
  if (status && !SHARE_STATUS[status]) throw new AppError('物品状态不正确');

  const filter = status ? { status } : {};
  const list = await col.shares.find(filter).sort({ createdAt: -1 })
    .skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).toArray();
  return {
    list: list.map((item) => ({ ...item, statusText: SHARE_STATUS[item.status] || item.status })),
    page,
    hasMore: list.length === ADMIN_PAGE_SIZE
  };
}

/** 闲置发布即公开，管理端只做下架/恢复（保留 rejected 兼容历史数据） */
export async function reviewShare(input) {
  const id = requireHex32(input.id, '物品编号');
  const status = requireText(input.status, 20, '物品状态');
  if (!['approved', 'off', 'rejected'].includes(status)) throw new AppError('操作参数不正确');

  const reason = status === 'rejected'
    ? requireText(input.reason, 60, '未通过原因')
    : (typeof input.reason === 'string' ? input.reason.trim().slice(0, 60) : '');

  const existing = await col.shares.findOne({ _id: id });
  if (!existing) throw new AppError('物品不存在');
  if (!['pending', 'approved', 'rejected', 'off', 'taken'].includes(existing.status)) {
    throw new AppError('物品状态不正确');
  }

  const result = await col.shares.updateOne(
    { _id: id, status: existing.status },
    { $set: { status, rejectReason: reason, updatedAt: Date.now() } }
  );
  if (result.matchedCount !== 1) throw new AppError('物品状态已变化，请刷新重试');
  return { id, status };
}

/** 彻底删除闲置（含图片引用一并丢弃） */
export async function deleteShare(input) {
  const id = requireHex32(input.id, '物品编号');
  const existing = await col.shares.findOne({ _id: id });
  if (!existing) throw new AppError('物品不存在');
  await col.shares.deleteOne({ _id: id });
  return { id };
}
