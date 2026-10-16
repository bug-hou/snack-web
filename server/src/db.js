import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client = null;
let database = null;

// 集合命名沿用云开发版本的业务语义，去掉了 _v1 后缀。
// 迁移脚本 scripts/migrate-from-cloudbase.js 负责旧集合名到新集合名的映射。
export const COLLECTIONS = {
  users: 'users',
  profiles: 'profiles',
  products: 'products',
  orders: 'orders',
  settings: 'shop_settings',
  addresses: 'addresses',
  shares: 'shares',
  posts: 'posts',
  comments: 'comments'
};

export const SETTINGS_ID = 'main';

async function ensureIndexes(db) {
  const jobs = [
    [COLLECTIONS.users, [
      { key: { username: 1 }, unique: true, name: 'uniq_username' },
      // 微信登录：openid 唯一，sparse 允许未绑定的网站账号没有该字段
      { key: { openid: 1 }, unique: true, sparse: true, name: 'uniq_openid' }
    ]],
    [COLLECTIONS.orders, [
      { key: { customerId: 1, createdAt: -1 }, name: 'idx_customer_created' },
      { key: { status: 1, createdAt: -1 }, name: 'idx_status_created' }
    ]],
    [COLLECTIONS.addresses, [{ key: { customerId: 1, updatedAt: -1 }, name: 'idx_address_customer' }]],
    [COLLECTIONS.shares, [
      { key: { status: 1, createdAt: -1 }, name: 'idx_share_status' },
      { key: { ownerId: 1, updatedAt: -1 }, name: 'idx_share_owner' }
    ]],
    [COLLECTIONS.posts, [
      { key: { status: 1, board: 1, pinned: -1, createdAt: -1 }, name: 'idx_post_board' },
      { key: { authorId: 1, createdAt: -1 }, name: 'idx_post_author' }
    ]],
    [COLLECTIONS.comments, [
      { key: { postId: 1, status: 1, createdAt: 1 }, name: 'idx_comment_post' },
      { key: { authorId: 1, createdAt: -1 }, name: 'idx_comment_author' }
    ]],
    [COLLECTIONS.products, [{ key: { archived: 1, is_available: 1 }, name: 'idx_product_state' }]]
  ];
  await Promise.all(
    jobs.map(([name, indexes]) =>
      db.collection(name).createIndexes(indexes).catch((error) => {
        console.warn('createIndexes skipped', name, error && error.message);
      })
    )
  );
}

export async function connectDb() {
  if (database) return database;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  database = client.db(config.mongoDb);
  await ensureIndexes(database);
  console.log(`[db] connected: ${config.mongoDb}`);
  return database;
}

export async function closeDb() {
  if (client) await client.close();
  client = null;
  database = null;
}

export function getDb() {
  if (!database) throw new Error('数据库尚未连接，请先调用 connectDb()');
  return database;
}

/** 数据库连通性探测，供冒烟测试接口使用；失败返回 false 而不抛错 */
export async function pingDb() {
  try {
    await getDb().admin().ping();
    return true;
  } catch {
    return false;
  }
}

/** 惰性取集合，避免模块加载时就要连库 */
export const col = {
  get users() { return getDb().collection(COLLECTIONS.users); },
  get profiles() { return getDb().collection(COLLECTIONS.profiles); },
  get products() { return getDb().collection(COLLECTIONS.products); },
  get orders() { return getDb().collection(COLLECTIONS.orders); },
  get settings() { return getDb().collection(COLLECTIONS.settings); },
  get addresses() { return getDb().collection(COLLECTIONS.addresses); },
  get shares() { return getDb().collection(COLLECTIONS.shares); },
  get posts() { return getDb().collection(COLLECTIONS.posts); },
  get comments() { return getDb().collection(COLLECTIONS.comments); }
};
