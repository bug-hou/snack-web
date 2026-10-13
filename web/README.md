# 口袋便利铺 · 商家管理后台（Web）

React + Vite 单页应用，通过 `@cloudbase/js-sdk` 调用云函数 `snackAdmin`。
部署目标：腾讯云 EdgeOne Makers（纯静态站点，无需自建服务器）。

## 本地开发

```bash
cd web
npm install
cp .env.example .env   # 按需修改
npm run dev
```

## 部署到 Makers

### 方式一：直接上传（最简单）

```bash
cd web
npm ci
npm run build:upload    # 构建并把 edgeone.json 复制进 dist/
```

1. 控制台 → Makers → 创建项目 → **直接上传**
2. 上传 `web/dist` 目录（**dist 根目录必须直接包含 `index.html`**，不要再多套一层）
3. 没有 ICP 备案的域名，加速区域选「全球可用区（不含中国大陆）」；已备案可选含中国大陆
4. 之后更新版本：项目内「构建部署 → 新建部署」，不要重新建项目

> 直接上传后项目无法切换为 Git 集成。

### 方式二：导入 Git 仓库（自动构建）

仓库根目录选择 `web/`，其余已由 `edgeone.json` 配置：

| 配置 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 安装命令 | `npm ci` |
| 输出目录 | `dist` |
| Node 版本 | `20.18.0` |

### 环境变量

- `VITE_CLOUDBASE_ENV`（**必填**）：CloudBase 环境 ID，代码中不再写死
- `VITE_CLOUDBASE_CLIENT_ID`（可选）：CloudBase Web 端 Client ID

使用位置：
- 本地开发 / 直接上传：写在 `web/.env`（已被 `.gitignore` 忽略，不会提交）
- Git 自动构建：在 Makers「项目设置 → 环境变量」添加，保存后需重新部署

这些变量会被打包进前端代码，**不要放任何私密密钥**。

## 部署后必做：CloudBase 安全域名

Makers 分配的域名（`*.edgeone.cool` 之类）以及你的自定义域名，必须加入
CloudBase 控制台 → 环境 → **安全来源 / WEB 安全域名**，否则登录和云函数调用会被跨域拦截。

## edgeone.json 说明

- `rewrites`：SPA 回退，未命中静态资源时返回 `index.html`
- `headers`：防嵌套（`X-Frame-Options: DENY`）、`nosniff`、哈希资源长缓存
