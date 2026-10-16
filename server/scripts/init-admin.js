// 创建站长账号：npm run init-admin -- <用户名> <密码>
// 用户名命中 .env 里 ADMIN_USERNAMES 时自动获得 admin 角色。
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb, closeDb, col } from '../src/db.js';
import { config } from '../src/config.js';

const [, , username, password] = process.argv;

async function main() {
  const name = String(username || '').trim();
  const pwd = String(password || '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    throw new Error('用户名需为3-20位字母、数字或下划线');
  }
  if (pwd.length < 8 || pwd.length > 64) throw new Error('密码需为8-64位');

  await connectDb();
  const existing = await col.users.findOne({ username: name });
  if (existing) {
    console.log(`用户 ${name} 已存在，角色：${existing.role || 'user'}`);
    await closeDb();
    return;
  }

  const role = config.adminUsernames.includes(name) ? 'admin' : 'user';
  const now = Date.now();
  const result = await col.users.insertOne({
    username: name,
    passwordHash: await bcrypt.hash(pwd, 10),
    nickName: '',
    role,
    createdAt: now,
    updatedAt: now
  });
  console.log(`已创建用户 ${name}，角色 ${role}，ID ${result.insertedId}`);
  if (role !== 'admin') {
    console.warn(`注意：${name} 不在 ADMIN_USERNAMES 中，无法进入商家后台。请把它加入 .env 的 ADMIN_USERNAMES。`);
  }
  await closeDb();
}

main().catch(async (error) => {
  console.error(error.message || error);
  process.exit(1);
});
