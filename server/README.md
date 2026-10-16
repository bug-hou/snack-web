# 爱尚里社区后端服务

把原先跑在微信云开发上的云函数（`snackShop` / `snackAdmin`）迁到自建 Node 服务，
部署在腾讯云轻量应用服务器（Lighthouse）上，数据库用 MongoDB。

## 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 运行时 | Node 18+ / Express | 与云函数同为 JS，逻辑可直接平移 |
| 数据库 | MongoDB | 与云开发同为文档型，嵌套结构（订单明细、包裹列表）无需拆表 |
| 认证 | 用户名 + 密码（bcrypt）+ JWT | 脱离微信后不再有 openid，自建账号体系 |
| 存储 | 腾讯云 COS（`test-cos-1312827847` / 成都） | 公有读直链，前端直接渲染；本地开发可切回磁盘 |

## 目录结构

```
server/
├── src/
│   ├── index.js            入口：中间件、静态托管、错误处理
│   ├── routes.js           全部路由
│   ├── config.js           环境变量
│   ├── db.js               MongoDB 连接与索引
│   ├── core/               常量、校验、时间、错误、匿名昵称
│   ├── middleware/auth.js  JWT 认证与角色校验
│   ├── services/           内容安全、文件上传
│   └── modules/            业务：settings / catalog / orders / addresses / shares / forum / profile / admin
├── scripts/
│   ├── init-admin.js       创建站长账号
│   └── migrate-from-cloudbase.js  导入云开发导出的数据
└── uploads/                本地存储模式的图片目录（启用 COS 后不使用）
```

## 图片存储

默认走腾讯云 COS，目录与云开发保持一致：`products/`、`community/`、`forum/`、`avatar/`。
上传后返回 `https://<bucket>.cos.<region>.myqcloud.com/<目录>/<文件>` 直链，
前端可直接渲染，无需再换临时链接。

- **公有读**（`COS_PRIVATE=false`，当前配置）：返回永久直链，最简单。
  建议在 COS 控制台给桶配 **Referer 防盗链**，只允许你的域名访问，避免被刷流量。
- **私有读**（`COS_PRIVATE=true`）：返回带签名的临时链接，默认 2 小时有效
  （`COS_SIGN_EXPIRES` 可调）。更安全，但存库的地址会过期，需要前端定期刷新。

本地开发不想连 COS 时，把 `COS_ENABLED=false` 即可切回 `uploads/` 目录。

## 本地启动

```bash
cd server
npm install
cp .env.example .env
# 编辑 .env，务必设置 JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run init-admin -- admin your-strong-password   # 创建站长
npm run dev        # 开发
npm start          # 生产
```

验证：`curl http://127.0.0.1:3000/api/health`

## 部署到 Lighthouse

### 1. 安装 MongoDB

```bash
# Ubuntu 24.04
sudo apt update
sudo apt install -y mongodb-org    # 或用官方源安装 MongoDB 7
sudo systemctl enable --now mongod
```

### 2. 拉取代码并启动

```bash
cd /opt && sudo git clone <你的仓库> aishangli
cd aishangli/server
npm ci --omit=dev
cp .env.example .env && vim .env
npm run init-admin -- admin <密码>
```

用 systemd 托管（`/etc/systemd/system/aishangli.service`）：

```ini
[Unit]
Description=Aishangli API
After=network.target mongod.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/aishangli/server
EnvironmentFile=/opt/aishangli/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now aishangli
sudo journalctl -u aishangli -f
```

### 3. Nginx 反向代理

```nginx
server {
    listen 80;
    server_name 你的域名;

    client_max_body_size 6m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
    }

    location / {
        root /opt/aishangli/h5/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

HTTPS 用 `certbot --nginx` 签发，或直接在 EdgeOne/Makers 后面挂。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | ✅ | 不设置服务拒绝启动 |
| `MONGO_URI` / `MONGO_DB` | ✅ | 数据库连接 |
| `ADMIN_USERNAMES` | ✅ | 命中这些用户名注册即为站长 |
| `CORS_ORIGIN` | ✅ | 生产写成具体域名，不要用 `*` |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | 否 | 仅本地存储模式生效，默认 `uploads` / 5 |
| `COS_ENABLED` | ✅ | `true` 走 COS，`false` 走本地磁盘 |
| `COS_BUCKET` / `COS_REGION` | ✅ | 如 `test-cos-1312827847` / `ap-chengdu` |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | ✅ | 腾讯云 API 密钥，**只放 `.env`，禁止写进代码或提交** |
| `COS_PREFIX` | 否 | 桶内统一前缀，留空则各目录平铺在桶根 |
| `COS_PRIVATE` | 否 | `false` 公有读永久直链；`true` 签名临时链接 |
| `TMS_ENABLED` 等 | 否 | 开启后走腾讯云文本内容安全 |

## 从云开发迁移

1. 云开发控制台导出集合 JSON，放到 `server/cloudbase-export/`
2. `npm run migrate`
3. **图片另行处理**：`cloud://` 文件需从云开发存储下载后上传到 COS 的
   `products/`、`community/`、`forum/`、`avatar/` 目录，再把库里的 `cloud://` 地址
   替换为 `https://<bucket>.cos.<region>.myqcloud.com/<目录>/<文件名>`

## 接口约定

统一返回 `{ ok: true, data }` 或 `{ ok: false, code, message }`，与云函数契约一致。
需要登录的接口在请求头带上 `Authorization: Bearer <token>`。
