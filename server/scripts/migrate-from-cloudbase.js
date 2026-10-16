// 把微信云开发导出的数据导入 MongoDB。
// 用法：
//   1. 在云开发控制台导出集合，得到 snack_products_v1.json 等文件，放到 server/cloudbase-export/
//   2. npm run migrate
//
// 脚本会做两件事：
//   - 集合改名：snack_xxx_v1 → 去掉前缀和 _v1
//   - 字段改名：customerOpenid/ownerOpenid/authorOpenid → customerId/ownerId/authorId
//
// ⚠️ 图片不会自动迁移：cloud:// 文件需要另外从云存储下载后放进 uploads/ 对应目录，
//    再把库里的 cloud:// 地址替换为 /uploads/<目录>/<文件名>。
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { connectDb, closeDb, col, COLLECTIONS } from '../src/db.js';

const EXPORT_DIR = process.env.EXPORT_DIR || path.resolve(process.cwd(), 'cloudbase-export');

const COLLECTION_MAP = {
  snack_products_v1: COLLECTIONS.products,
  snack_orders_v1: COLLECTIONS.orders,
  snack_shop_settings_v1: COLLECTIONS.settings,
  snack_addresses_v1: COLLECTIONS.addresses,
  snack_shares_v1: COLLECTIONS.shares,
  snack_posts_v1: COLLECTIONS.posts,
  snack_comments_v1: COLLECTIONS.comments,
  snack_profiles_v1: COLLECTIONS.profiles
};

const FIELD_MAP = {
  customerOpenid: 'customerId',
  ownerOpenid: 'ownerId',
  authorOpenid: 'authorId'
};

function convertFields(value) {
  if (Array.isArray(value)) return value.map(convertFields);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[FIELD_MAP[key] || key] = convertFields(val);
    }
    return out;
  }
  return value;
}

function readDocs(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results;
  return [];
}

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    throw new Error(`找不到导出目录：${EXPORT_DIR}`);
  }
  await connectDb();

  let total = 0;
  for (const [oldName, newName] of Object.entries(COLLECTION_MAP)) {
    const file = path.join(EXPORT_DIR, `${oldName}.json`);
    if (!fs.existsSync(file)) {
      console.log(`- 跳过 ${oldName}（未找到导出文件）`);
      continue;
    }
    const docs = readDocs(file).map(convertFields).filter((doc) => doc && doc._id !== undefined);
    if (!docs.length) {
      console.log(`- ${oldName} 无数据`);
      continue;
    }
    const operations = docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true }
    }));
    const result = await col[Object.keys(COLLECTIONS).find((k) => COLLECTIONS[k] === newName)]
      .bulkWrite(operations, { ordered: false });
    const count = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    total += count;
    console.log(`✓ ${oldName} → ${newName}：${count} 条`);
  }

  console.log(`\n导入完成，共 ${total} 条。记得处理 cloud:// 图片地址。`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error.message || error);
  process.exit(1);
});
