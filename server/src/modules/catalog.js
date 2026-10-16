import crypto from 'node:crypto';
import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { money, requireText, requireCents, requireBoolean } from '../core/validate.js';
import { CATEGORIES, TONES, LEGACY_PRODUCT_IMAGES } from '../core/constants.js';
import { assertImageUrl } from '../services/upload.js';

function viewProduct(p) {
  return {
    id: p._id,
    name: p.name,
    spec: p.spec,
    category: p.category,
    priceCents: p.priceCents,
    price: money(p.priceCents),
    label: p.label || '',
    initials: p.initials || '',
    tone: p.tone || 'peach',
    image: p.image || '',
    featured: !!p.featured
  };
}

/** 顾客端商品列表：只返回在售、未归档、价格有效的商品 */
export async function listProducts() {
  const list = await col.products
    .find({ is_available: true, archived: { $ne: true }, priceCents: { $gt: 0 } })
    .limit(100)
    .toArray();
  return list.map(viewProduct);
}

/** 管理端商品列表（含下架，不含已归档） */
export async function listAllProducts() {
  const list = await col.products.find({ archived: { $ne: true } }).limit(100).toArray();
  return list;
}

function productInput(input) {
  const name = requireText(input.name, 40, '商品名称');
  const spec = requireText(input.spec, 60, '商品规格');
  const category = requireText(input.category, 20, '商品分类');
  if (!CATEGORIES.includes(category)) throw new AppError('请选择商品分类');

  const priceCents = requireCents(input.priceCents, '商品价格', 1000000);
  if (priceCents === 0) throw new AppError('商品价格须大于零');

  const label = input.label ? requireText(input.label, 12, '商品标签') : '';
  const tone = TONES.includes(input.tone) ? input.tone : 'peach';
  if (typeof input.is_available !== 'boolean' || typeof input.featured !== 'boolean') {
    throw new AppError('商品状态不正确');
  }

  // 图片：既兼容历史本地路径（白名单），也接受新的 /uploads/products/ 地址
  const image = input.image ? requireText(input.image, 300, '商品图片') : '';
  if (image && !LEGACY_PRODUCT_IMAGES.includes(image)) {
    assertImageUrl(image, ['products'], '商品图片');
  }

  return {
    name,
    spec,
    category,
    priceCents,
    label,
    tone,
    image,
    initials: name.slice(0, 2),
    is_available: input.is_available,
    featured: input.featured,
    archived: false,
    updatedAt: Date.now()
  };
}

function newProductId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export async function saveProduct(input) {
  const product = productInput(input);
  if (input.id) {
    const id = requireText(input.id, 40, '商品编号');
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new AppError('商品编号格式不正确');
    const existing = await col.products.findOne({ _id: id });
    if (!existing) throw new AppError('商品不存在');
    await col.products.updateOne({ _id: id }, { $set: product });
    return { id };
  }
  const id = newProductId();
  await col.products.insertOne({ _id: id, ...product, createdAt: Date.now() });
  return { id };
}

/** 删除商品只做归档：历史订单仍按 id 引用商品，物理删除会导致订单明细无法展示 */
export async function deleteProduct(input) {
  const id = requireText(input.id, 40, '商品编号');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new AppError('商品编号格式不正确');
  const existing = await col.products.findOne({ _id: id });
  if (!existing) throw new AppError('商品不存在');
  await col.products.updateOne({ _id: id }, { $set: { archived: true, is_available: false, updatedAt: Date.now() } });
  return { id };
}

/** 下单时校验商品：必须是在售、未归档、价格有效 */
export async function assertSellable(productId) {
  const p = await col.products.findOne({ _id: productId });
  if (!p || !p.is_available || p.archived === true ||
      !Number.isInteger(p.priceCents) || p.priceCents < 1 || p.priceCents > 1000000) {
    throw new AppError('商品已下架或尚未上架，请返回清单重试');
  }
  return p;
}

export { viewProduct, requireBoolean };
