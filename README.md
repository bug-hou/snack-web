# 🍽️ 点菜小程序（云开发版）

一个完整的微信点菜系统，基于**微信云开发**，无需购买服务器。

## 📁 项目结构

```
ordering/
├── miniprogram/                      # 微信小程序
│   ├── cloudfunctions/               # ☁️ 云函数（后端逻辑）
│   │   ├── api/                      #   主 API（分类/菜品/订单/统计）
│   │   └── initDB/                   #   数据库初始化 + 种子数据
│   ├── pages/
│   │   ├── index/                    # 菜单首页
│   │   ├── order/                    # 下单页
│   │   └── orders/                   # 订单列表
│   ├── utils/api.js                  # 云函数调用封装（兼容原接口）
│   ├── app.js                        # 全局 - 云开发初始化 + 购物车
│   ├── app.json                      # 配置（cloud: true）
│   └── app.wxss                      # 设计系统
│
├── admin/                            # Web 后台管理系统
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
│
├── server/                           # Express 后端（供后台管理使用）
│   ├── index.js                      # API 服务
│   ├── db.js                         # SQLite 数据库
│   ├── cos.js                        # COS 图片上传
│   └── .env                          # COS 密钥配置
│
├── agent/                            # LangGraph TS + CloudBase Agent
│   ├── src/                          # Agent 工作流与 HTTP 入口
│   ├── .env.example                  # Agent 环境变量示例
│   └── README.md                     # Agent 本地开发/部署说明
│
└── project.config.json               # 小程序项目配置
```

## 🚀 快速开始

### 1. 开通云开发

在微信开发者工具中：
1. 打开项目 → 点击「云开发」按钮
2. 开通云环境，记录**环境 ID**（如 `your-env-xxxx`）
3. 创建以下数据库集合：
   - `categories` - 分类
   - `dishes` - 菜品
   - `orders` - 订单
   - `tables` - 桌号

### 2. 配置环境 ID

修改 `miniprogram/app.js` 中的环境 ID：
```js
wx.cloud.init({
  env: 'your-env-xxxx',  // 👈 改成你的
  traceUser: true
});
```

### 3. 部署云函数

在微信开发者工具中：
- 右键 `cloudfunctions/api` → 上传并部署
- 右键 `cloudfunctions/initDB` → 上传并部署
- 在云函数列表中点击 `initDB` → 测试 → 执行（初始化种子数据）

### 4. 配置 AI 识菜

当前 `wx-server-sdk` 不一定内置 AI 入口；`api` 云函数支持两种方式：

1. 已开通 CloudBase AI：配置 `CLOUDBASE_AI_MODEL`（可选，默认 `deepseek-v4-pro`）。
2. 使用 OpenAI 兼容视觉模型：在 `api` 云函数环境变量配置：
   - `AI_API_KEY`
   - `AI_API_BASE_URL`，例如 `https://api.example.com/v1`
   - `AI_MODEL`，必须是支持图片理解的模型

配置后重新上传并部署 `cloudfunctions/api`。

### 5. 本地开发家庭厨房 Agent

项目已内置独立的 `agent/` 目录，使用 `LangGraph TS + CloudBase Agent`：

```bash
cd agent
npm install
cp .env.example .env
npm run dev
```

部署为 CloudBase HTTP 云函数：

```bash
cd agent
npm run build
tcb fn deploy family-kitchen-agent --httpFn -e cloud1-d9gvn0kkg13217e4e
```

小程序端可通过 `miniprogram/utils/agent.js` 调用，要求微信基础库 `3.15.1+`。

### 6. 启动后台管理

```bash
cd server
npm install
node index.js
# 浏览器打开 http://localhost:3000/admin
```

## 🏗️ 架构说明

```
┌─────────────────────┐
│   微信小程序（顾客端）  │
│   wx.cloud.callFunction│
└──────────┬──────────┘
           │ 云函数调用
     ┌─────▼─────┐
     │  ☁️ 云函数  │
     │  api/index │
     └─────┬─────┘
           │
     ┌─────▼─────┐    ┌──────────────┐
     │ 云数据库    │    │  云存储（图片） │
     └───────────┘    └──────────────┘

┌─────────────────────┐
│   Web 后台管理系统    │
│   fetch() → Express  │
└──────────┬──────────┘
           │ HTTP
     ┌─────▼─────┐    ┌──────────────┐
     │ Express   │    │  COS（图片）   │
     │ 服务端     │    │               │
     └─────┬─────┘    └──────────────┘
           │
     ┌─────▼─────┐
     │  SQLite   │
     └───────────┘
```

> 小程序顾客端走云开发（免费），后台管理系统走 Express（本地 / VPS）。

## ✨ 功能特性

### 小程序端（顾客）
- 🏠 分类浏览 + 热销推荐
- 🔍 菜品搜索
- 🛒 智能购物车（本地持久化）
- 📝 一键下单
- 📋 订单追踪（时间线进度）
- 🔄 再来一单
- 📱 震动反馈

### 后台管理
- 📊 数据仪表盘
- 📁 分类 CRUD
- 🍳 菜品 CRUD + 图片上传
- 📋 订单处理（状态流转）

## ⚠️ 注意事项

1. **小程序域名白名单**：在微信公众平台配置云函数域名
2. **后台管理**如需部署到线上，可将 admin 文件夹上传到云开发静态网站托管
3. 云开发免费额度：调用次数 10 万次/月，足以支撑中小餐馆日常使用

## 🗣️ 邻里广场（社区信息交流）

类似贴吧的邻里论坛，位于 tabBar「广场」，也可从首页和「我的」进入。

| 页面 | 说明 |
| --- | --- |
| `pages/community-forum/index` | 帖子列表，按板块筛选、下拉刷新、触底加载 |
| `pages/community-forum-post/index` | 发布帖子（板块 / 标题 / 正文 / 最多 3 张图） |
| `pages/community-forum-detail/index` | 帖子详情、点赞、评论、删除自己的内容 |

板块：`邻里闲聊 chat`、`互助求助 help`、`失物招领 lost`、`社区公告 notice`（公告仅店主可发）。

- 身份一律匿名，昵称由 openid 派生（`邻居XXXX`），不获取头像与手机号。
- 所有写入走云函数，文本过 `security.msgSecCheck`；命中 87014 直接拒绝发布。
- 频率限制：24 小时内最多发 10 帖，10 分钟内最多发 10 条评论。

### 需要新建的数据库集合

| 集合 | 用途 | 建议权限 |
| --- | --- | --- |
| `snack_posts_v1` | 帖子 | 仅管理端可读写（读写全部走云函数） |
| `snack_comments_v1` | 评论 | 仅管理端可读写 |

建议索引：`snack_posts_v1` 建 `status + board + pinned + createdAt` 组合索引；
`snack_comments_v1` 建 `postId + status + createdAt` 组合索引。

---

## ⚖️ 个人主体合规改造说明

个人主体小程序**不开放电商类目**，审核会以「含购物车 / 订单按钮 / 立即购买流程」驳回。
本次改造把产品从「在线电商」降级为「社区信息展示 + 需求登记 + 线下对接」：

| 改造项 | 原来 | 现在 |
| --- | --- | --- |
| 商品卡按钮 | 立即购买 | 已移除，只保留「＋」加入需求清单 |
| 购物车 tab / 页 | 购物车 | 已从 tabBar 移除，改名「需求清单」 |
| 订单 tab / 页 | 我的订单 | 已从 tabBar 移除，改名「我的需求」 |
| 结算按钮 | 去结算 → 提交订单 · 货到付款 | 登记需求 → 登记需求 · 线下对接 |
| 金额文案 | 合计 / 订单合计 | 参考合计 |
| 支付 | 货到付款 | 线下当面结算（页面多处明示不在线收款） |
| 页面提示 | 无 | 首页 / 清单 / 登记页 / 需求页均有「不提供在线下单与支付」提示 |

同时新增了纯信息属性的「邻里广场」，强化社区属性、弱化交易属性。

### 提交审核时的建议

1. **服务类目**：选「生活服务 - 便民信息」或「工具 - 信息查询」等个人主体可选项，不要选电商类目。
2. **补充说明**：备注中写明「本小程序为小区邻里信息展示与需求登记工具，不提供在线交易、在线支付与资金托管，所有交接在线下完成」。
3. **测试账号**：提供一个可登录的账号，并说明需求登记不会产生真实订单。
4. **内容安全**：广场为 UGC，务必确认 `msgSecCheck` 生效（云函数日志不应出现 `msgSecCheck unavailable`）。
5. **如果仍被驳回**：个人主体做电商闭环基本无法通过，建议注册个体工商户（成本几百元）后变更主体为企业/个体工商户，再选电商类目并开通微信支付 —— 这是唯一能保留完整下单支付链路的方案。

## 🖼️ 图片资源存储

图片统一存放在**云开发存储（底层为 COS 对象存储）**，不再随小程序包发布：

| 资源 | 云存储路径 | 说明 |
| --- | --- | --- |
| 商品图 | `products/<name>.jpg` | 后台上传或脚本迁移，数据库 `snack_products_v1.image` 存 `cloud://` fileID |
| 闲置物品图 | `community/<id>.<ext>` | 居民发布时上传，数据库 `snack_shares_v1.images` 存 `cloud://` fileID |
| UI 图标 | `icons/<name>.svg`（可选） | 默认保留在包内 `miniprogram/images/community/`，避免首屏网络依赖 |

小程序 `<image src="cloud://...">` 可直接渲染；Web 管理端通过 `app.getTempFileURL()` 换取临时链接（`web/src/cloud.js` 的 `resolveImage`）。

迁移仍在仓库里的本地图片：

```bash
cd web
npm install                       # 安装 @cloudbase/node-sdk
# 在 web/.env 追加：CLOUDBASE_SECRETID / CLOUDBASE_SECRETKEY（腾讯云 API 密钥）
npm run assets:upload             # 上传 + 回填数据库 image 字段
npm run assets:upload -- --clean  # 确认线上生效后再删除本地副本
```

可选参数：`--with-icons` 一并上传 UI 图标，`--no-db` 不写数据库，`--dry-run` 只打印计划。上传后的 fileID 映射写入 `web/src/assets-map.json`。
