import { col } from '../db.js';
import { AppError } from '../core/errors.js';
import { requireText, requirePhoneTail, requireHex32, newId } from '../core/validate.js';
import { BUILDINGS, CONTACT_PREFERENCES, ADDRESS_LIMIT } from '../core/constants.js';

function addressView(a) {
  return {
    id: a._id,
    recipient: a.recipient,
    phone: a.phone,
    building: a.building,
    room: a.room,
    contactPreference: a.contactPreference,
    label: a.label || '家',
    pickupPhoneLast4: typeof a.pickupPhoneLast4 === 'string' ? a.pickupPhoneLast4 : '',
    updatedAt: a.updatedAt
  };
}

export async function listAddresses(userId) {
  const list = await col.addresses
    .find({ customerId: userId })
    .sort({ updatedAt: -1 })
    .limit(ADDRESS_LIMIT)
    .toArray();
  return list.map(addressView);
}

/** 取自己的地址；不是本人的一律当不存在，避免越权读取 */
export async function getOwnAddress(userId, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new AppError('请选择收货地址');
  const doc = await col.addresses.findOne({ _id: id });
  if (!doc || doc.customerId !== userId) throw new AppError('地址不存在，请重新选择');
  return doc;
}

export async function saveAddress(userId, input) {
  const recipient = requireText(input.recipient, 30, '收货人');
  const phone = requireText(input.phone, 11, '联系电话');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new AppError('请输入有效的手机号码');

  const building = requireText(input.building, 2, '楼栋');
  if (!BUILDINGS.includes(building)) throw new AppError('当前仅配送16、17、18栋');

  const room = requireText(input.room, 20, '门牌号');
  if (!/^[0-9A-Za-z一-龥-]{1,20}$/.test(room)) throw new AppError('请填写有效门牌号');

  const contactPreference = requireText(input.contactPreference, 16, '送达方式');
  if (!CONTACT_PREFERENCES.includes(contactPreference)) throw new AppError('请选择送达联系偏好');

  const label = input.label ? requireText(input.label, 12, '地址标签') : '家';
  const pickupPhoneLast4 = requirePhoneTail(input.pickupPhoneLast4, phone);

  const data = { recipient, phone, building, room, contactPreference, label, pickupPhoneLast4, updatedAt: Date.now() };

  if (input.id) {
    const existing = await getOwnAddress(userId, input.id);
    const result = await col.addresses.updateOne({ _id: existing._id, customerId: userId }, { $set: data });
    if (result.matchedCount !== 1) throw new AppError('地址更新失败，请重试');
    return addressView({ _id: existing._id, ...data });
  }

  const total = await col.addresses.countDocuments({ customerId: userId });
  if (total >= ADDRESS_LIMIT) throw new AppError('最多保存10个地址，请先删除不再使用的地址');

  const id = newId();
  const doc = { _id: id, customerId: userId, ...data, createdAt: Date.now() };
  await col.addresses.insertOne(doc);
  return addressView(doc);
}

export async function deleteAddress(userId, input) {
  const existing = await getOwnAddress(userId, input.id);
  const result = await col.addresses.deleteOne({ _id: existing._id, customerId: userId });
  if (result.deletedCount !== 1) throw new AppError('地址删除失败，请重试');
  return { id: existing._id };
}

export { addressView };
