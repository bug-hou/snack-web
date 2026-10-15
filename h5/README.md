# 爱尚里生活 · H5 网页版

小程序同款界面的手机网页版，面向邻居（顾客端）。复用小程序的云函数 `snackShop`
与同一套 CloudBase 数据，小程序审核期间可以先用网页提供服务。

- 技术栈：React 18 + Vite 6 + `@cloudbase/js-sdk`，纯静态站点，不需要自建服务器
- 路由：hash 模式（`#/`），刷新和直接分享链接都能落到对应页面
- 身份：CloudBase **匿名登录**（uid → 云函数里的 `rn_<uid>`，与微信 openid 完全隔离，不会串号）

## 页面对照

| 路由 | 对应小程序页面 | 说明 |
| --- | --- | --- |
| `#/` | pages/snack-home | 社区首页：服务入口、邻里闲置、便利铺商品、需求清单 |
| `#/forum` | pages/community-forum | 邻里广场 |
| `#/forum/new`、`#/forum/:id` | forum-post / forum-detail | 发帖、详情与评论 |
| `#/profile`、`#/profile/edit` | snack-profile / snack-profile-edit | 我的、头像昵称 |
| `#/cart` | snack-cart | 需求清单 |
| `#/checkout` | snack-checkout | 确认需求登记 |
| `#/orders` | snack-orders | 我的需求（进度自动刷新） |
| `#/address` | snack-address | 收货地址管理 |
| `#/shares`、`#/shares/new`、`#/shares/:id` | community-share* | 邻里闲置 |
| `#/service/:type` | community-service | 服务流程与须知 |
| `#/errand/express`、`#/errand/purchase` | community-errand | 快递代取 / 便利店代买登记 |

底部 Tab（社区 / 广场 / 我的）与小程序 tabBar 一致。

## 本地开发

```bash
cd h5
npm install
cp .env.example .env    # 填写 VITE_CLOUDBASE_ENV
npm run dev             # http://127.0.0.1:5173
```

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_CLOUDBASE_ENV` | 是 | 云开发环境 ID，例如 `cloud1-xxxx` |
| `VITE_CLOUDBASE_CLIENT_ID` | 否 | Publishable Key（控制台 / API Key 生成），匿名登录报 credentials 错时填写 |

变量会被打包进前端代码，**不要放任何私密密钥**。

## 部署（腾讯云 EdgeOne Makers）

### 方式一：直接上传

```bash
cd h5
npm ci
npm run build:upload     # 构建并把 edgeone.json 复制进 dist/
```

1. Makers → 创建项目 → 直接上传，上传 `h5/dist` 目录（根目录必须直接包含 `index.html`）
2. 无 ICP 备案域名选「全球可用区（不含中国大陆）」，已备案可选含中国大陆
3. 后续更新：项目内「构建部署 → 新建部署」，不要重复建项目

### 方式二：Git 仓库自动构建

仓库根目录选 `h5/`，`edgeone.json` 已配置构建命令 `npm run build`、输出目录 `dist`、
Node 20.18.0。环境变量在 Makers「项目设置 → 环境变量」里添加，保存后需重新部署。

## 部署后必做的三项配置

1. **WEB 安全域名**：CloudBase 控制台 → 环境 → 安全配置 → WEB 安全域名，
   加入站点域名（本地调试可加 `http://127.0.0.1:5173`）。未加会报「没有访问权限」。
2. **匿名登录**：控制台 → 环境 → 登录授权 → 身份源，开启「匿名登录」。
   未开启时页面会提示，可改用账号登录。
3. **云函数版本**：部署 `miniprogram/cloudfunctions/snackShop`，
   确认是支持 `cloudbase` 身份（含 `cloudbaseUid`）的版本，否则网页端会被当成未登录。

> 店主身份只在微信小程序链路下判定，网页端一律按普通邻居处理，
> 因此订单页不显示「店主工作台」。管理端请用 `web/` 的商家后台。

## 与小程序的行为差异

- 商品图由云函数直接返回临时链接；广场、闲置、头像的 `cloud://` 图片由前端
  `getTempFileURL` 换取临时链接后展示。
- 期望送达时间用两个下拉框（日期 + 时间）替代小程序的 `picker`。
-「读取剪贴板」按钮在网页上保留为手动粘贴（浏览器剪贴板权限受限）。
- 分享给邻居改为浏览器自身的分享/复制链接。
