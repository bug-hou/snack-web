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
