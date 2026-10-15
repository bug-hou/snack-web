#!/usr/bin/env node
// 把仓库内的本地图片上传到云开发存储（底层即 COS / 对象存储），并返回 cloud:// fileID。
// 用法（在 web 目录或仓库根执行）：
//   node web/scripts/upload-assets.mjs                 # 上传 + 回填数据库
//   node web/scripts/upload-assets.mjs --clean         # 上传成功后删除本地副本
//   node web/scripts/upload-assets.mjs --with-icons    # 同时上传 UI 图标（默认保留在本地）
//   node web/scripts/upload-assets.mjs --dry-run       # 只打印计划，不上传
//
// 需要凭据（写入 web/.env 或环境变量）：
//   CLOUDBASE_ENV=cloud1-xxxx           云开发环境 ID
//   CLOUDBASE_SECRETID=xxxx             腾讯云 API 密钥 ID
//   CLOUDBASE_SECRETKEY=xxxx            腾讯云 API 密钥 Key
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cloudbase from '@cloudbase/node-sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const webRoot = path.join(root, 'web');
const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const dryRun = has('--dry-run');
const clean = has('--clean');
const withIcons = has('--with-icons');
const skipDb = has('--no-db');

// 本地 .env 不引入额外依赖，简单解析即可
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(webRoot, file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const matched = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!matched) continue;
    const key = matched[1];
    const value = matched[2].trim().replace(/^['"]|['"]$/g, '');
    if (value && !(key in process.env)) process.env[key] = value;
  }
}

const env = process.env.CLOUDBASE_ENV || process.env.TCB_ENV || process.env.VITE_CLOUDBASE_ENV;
const secretId = process.env.CLOUDBASE_SECRETID || process.env.TENCENTCLOUD_SECRETID;
const secretKey = process.env.CLOUDBASE_SECRETKEY || process.env.TENCENTCLOUD_SECRETKEY;
if (!env || !secretId || !secretKey) {
  console.error('缺少凭据：请在 web/.env 或环境变量中配置 CLOUDBASE_ENV / CLOUDBASE_SECRETID / CLOUDBASE_SECRETKEY');
  process.exit(1);
}

// legacy：小程序/Web 里原先引用的本地路径，上传后统一替换为云端 fileID
const ASSETS = [
  { local: 'miniprogram/images/products/eggs.jpg', legacy: '/images/products/eggs.jpg', cloudPath: 'products/eggs.jpg' },
  { local: 'miniprogram/images/products/tissue.jpg', legacy: '/images/products/tissue.jpg', cloudPath: 'products/tissue.jpg' },
  { local: 'miniprogram/images/products/milk.jpg', legacy: '/images/products/milk.jpg', cloudPath: 'products/milk.jpg' },
  { local: 'miniprogram/images/placeholder-food.png', legacy: '/images/placeholder-food.png', cloudPath: 'products/placeholder-food.png' }
];
if (withIcons) {
  for (const name of ['clipboard-list', 'map-pin', 'package-open', 'plus', 'repeat-2', 'shopping-bag']) {
    ASSETS.push({ local: `miniprogram/images/community/${name}.svg`, legacy: `/images/community/${name}.svg`, cloudPath: `icons/${name}.svg` });
  }
}

const app = cloudbase.init({ env, secretId, secretKey });

async function main() {
  const uploaded = [];
  for (const asset of ASSETS) {
    const localPath = path.join(root, asset.local);
    if (!fs.existsSync(localPath)) {
      console.warn(`跳过：本地文件不存在 ${asset.local}`);
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${asset.local} -> ${asset.cloudPath}`);
      continue;
    }
    const result = await app.uploadFile({ cloudPath: asset.cloudPath, fileContent: fs.createReadStream(localPath) });
    if (!result || !result.fileID) throw new Error(`上传失败：${asset.cloudPath}`);
    uploaded.push({ ...asset, fileID: result.fileID });
    console.log(`已上传 ${asset.local} -> ${result.fileID}`);
  }

  if (dryRun || !uploaded.length) return;

  // 映射表供 Web 端解析旧路径；键同时支持小程序本地路径与云端路径
  const mapPath = path.join(webRoot, 'src/assets-map.json');
  const existing = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const map = { ...existing };
  for (const item of uploaded) {
    map[item.legacy] = item.fileID;
    map[`/${item.cloudPath}`] = item.fileID;
  }
  fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`映射已写入 ${path.relative(root, mapPath)}`);

  if (!skipDb) {
    const db = app.database();
    const products = db.collection('snack_products_v1');
    for (const item of uploaded) {
      const { data } = await products.where({ image: item.legacy }).limit(100).get();
      for (const doc of data) {
        await products.doc(doc._id).update({ image: item.fileID, updatedAt: Date.now() });
      }
      if (data.length) console.log(`数据库已更新 ${data.length} 个商品：${item.legacy} -> ${item.fileID}`);
    }
  }

  if (clean) {
    const targets = [
      ...uploaded.map(item => path.join(root, item.local)),
      path.join(webRoot, 'public/products'),
      path.join(webRoot, 'dist/products')
    ];
    for (const target of targets) {
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`已删除本地副本 ${path.relative(root, target)}`);
    }
  }

  console.log('完成：商品图已存放在云开发存储（COS），fileID 见 web/src/assets-map.json');
}

main().catch(error => {
  console.error('上传失败：', error && error.message ? error.message : error);
  process.exit(1);
});
