# 爱尚里生活 · H5 网页版

手机网页版，面向邻居（顾客端）。数据来自自建后端 `server/`（Node + MongoDB，
部署在 Lighthouse），不再依赖微信云开发。

- 技术栈：React 18 + Vite 6，通过 `fetch` 调用 `/api`，纯静态站点，不需要在前端跑服务
- 路由：hash 模式（`#/`），刷新和直接分享链接都能落到对应页面
- 响应式：手机 480 → 平板 720 → 桌面 960/1120 三档，桌面端底部 Tab 变顶部导航、列表双列
- 身份：用户名 + 密码登录，令牌存 localStorage；未登录可浏览只读内容

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
cp .env.example .env    # 默认 /api，跨域部署时改 VITE_API_BASE
npm run dev             # http://127.0.0.1:5173
```

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | 否 | 后端地址，默认 `/api`（同源部署）。前后端分离时填 `https://api.example.com/api` |

本地开发时 Vite 已把 `/api`、`/uploads` 代理到 `http://127.0.0.1:3000`，
可用 `VITE_DEV_API_TARGET` 改指向其他后端地址。

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

### 方式三：CloudBase 静态托管（tcb CLI）

构建产物可以直接传到云开发自带的静态托管，部署后的域名默认已在安全域名白名单里：

```bash
# 部署目录已经指向 h5/ 时（cwd 就是 h5）
npm ci && npm run build && tcb hosting deploy ./dist snack-h5 -e cloud1-d9gvn0kkg13217e4e
```

从仓库根目录执行的话要先进目录：

```bash
cd h5 && npm ci && npm run build && tcb hosting deploy ./dist snack-h5 -e cloud1-d9gvn0kkg13217e4e
```

注意两点：

- `dist` 由 `npm run build` 生成，必须先安装依赖再构建，直接 `tcb hosting deploy ./dist` 会报
  `Path does not exist`
- 路径是相对当前工作目录的，部署目录已经设为 `h5` 时不要再写成 `./h5/dist`
- 环境变量来自仓库里的 `.env.production`（只有环境 ID，无密钥），CI 上不需要额外配置

访问地址：`https://<静态托管默认域名>/snack-h5/#/`（hash 路由，子目录部署无需额外改写规则）。

## 部署后必做的配置

1. **后端 CORS**：把站点域名加入服务端 `.env` 的 `CORS_ORIGIN`，
   否则浏览器会被跨域拦截（本地调试可加 `http://127.0.0.1:5173`）。
2. **创建站长账号**：在服务端执行 `npm run init-admin -- admin <密码>`。
3. **Nginx 反代**：把 `/api` 指向 Node 服务即可，图片走 COS 无需反代（见 `server/README.md`）。

> 网页端一律按普通邻居处理，不使用店主身份，
> 因此订单页不显示「店主工作台」。管理端请用 `web/` 的商家后台。

## 与小程序的行为差异

- 图片统一是 COS 直链（`https://<bucket>.cos.<region>.myqcloud.com/<目录>/<文件>`），
  无需再换临时链接；历史数据里残留的 `cloud://` 无法解析，会回退到占位图。
- 期望送达时间用两个下拉框（日期 + 时间）替代小程序的 `picker`。
-「读取剪贴板」按钮在网页上保留为手动粘贴（浏览器剪贴板权限受限）。
- 分享给邻居改为浏览器自身的分享/复制链接。
