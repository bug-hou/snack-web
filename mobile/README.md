# mobile · 邻里点单 React Native 端（最小骨架）

用于验证 **RN → CloudBase → 云函数 → 云数据库** 全链路是否跑得通的最小可运行工程。
目标不是做完整 App，而是把三个不确定点一次性验证掉：RN 适配器能不能用、非小程序身份怎么拿、云函数协议能不能直接复用。

## 为什么是 Expo（React Native 原生）而不是 uni-app / Taro

| 方案 | 结论 |
| --- | --- |
| **Expo / RN 原生** | ✅ 采用。CloudBase 有官方 RN 适配器（`@cloudbase/adapter-rn`），后端、云函数、数据库、云存储全部直接复用；项目已有 React Web 端，技术栈一致 |
| Taro | ❌ RN 端（taro-native-shell）维护状态不稳定，且与现有原生小程序代码不是同一套 |
| uni-app | ❌ 它的「App 端」不是 React Native，而是自有 nvue/uvue 引擎，等于换技术栈，React 生态无法复用 |

## 运行环境

- Node.js >= 18
- React Native 0.76+ / Expo SDK 52+（当前模板：RN 0.86 + Expo SDK 57，满足要求）
- iOS 需 `cd ios && pod install`（执行 `npx expo prebuild` 后才会生成 ios 目录）

## 目录结构

```
mobile/
├── App.tsx              # 自检页：环境 / 登录 / 链路自检 / 菜单列表
├── src/
│   ├── config.ts        # EXPO_PUBLIC_* 环境变量与校验
│   ├── cloudbase.ts     # CloudBase 初始化 + 适配器注册 + invoke 封装
│   ├── session.ts       # 登录（匿名 / 账号密码）与登录态恢复
│   ├── api.ts           # 云函数接口契约（与小程序 utils + web/src 同协议）
│   ├── storage.ts       # MMKV 持久化
│   └── theme.ts         # 与小程序 app.wxss 对齐的设计 token
└── .env.example
```

## 跑起来

```bash
cd mobile
cp .env.example .env      # 填写 EXPO_PUBLIC_CLOUDBASE_ENV / REGION / ACCESS_KEY
npm install
npm run typecheck         # 类型检查
npm start                 # 随后按 a(iOS) / a(Android) 启动，或用 Expo Go 扫码
```

`.env` 改动后必须**重启** `expo start`，Expo 不会热更新环境变量。

### Publishable Key 获取

云开发控制台 → 环境 → **API Key 配置** → 生成 Publishable Key。它可安全暴露在客户端，用于访问公开资源；涉及用户数据时仍需登录。

## 云函数侧需要的配合

`snackShop` 原先只认微信上下文：

```js
const openid = cloud.getWXContext().OPENID;
if (!openid) return { ok: false, message: '请在微信小程序中打开' };
```

骨架已把它改造成多来源身份解析（与 `snackAdmin` 一致）：

1. 小程序链路 → `cloud.getWXContext().OPENID`（行为不变）
2. RN / Web 链路 → `@cloudbase/node-sdk` 的 `auth.getUserInfo().uid`，兜底读 `context.userInfo.uid`，前缀 `rn_` 与微信 openid 隔离
3. 都没有 → 云函数环境变量 `MOBILE_GUEST_READ=1` 时允许**游客只读**（`getCatalog` / 帖子 / 闲置列表），写操作一律拒绝；否则返回「请先登录」

身份一律由服务端从调用上下文读取，**不接受客户端传入的 uid**，否则可伪造身份越权读写他人订单。

## 验证清单

在自检页逐项确认：

- [ ] 环境卡片三项都显示已配置
- [ ] 点「匿名登录」能拿到 uid（控制台需先开启匿名登录）
- [ ] 链路自检显示 `getCatalog 返回 N 个商品`
- [ ] 菜单列表能渲染出商品名与价格（图片是云存储临时链接）

若自检报「请在微信小程序中打开，或在移动端先登录」，说明云函数还没读到 CloudBase 身份：
先在云函数日志里看 `snackShop non-wechat identity` 打印的 `identitySource`，再决定是开启匿名登录还是临时开 `MOBILE_GUEST_READ=1`。

## 已知限制（骨架阶段）

- 只做了只读链路：菜单 / 广场列表，没有下单、购物车、上传图片
- 未接入推送（RN 端无法复用小程序订阅消息，需另接极光 / 厂商通道）
- 未接入微信登录（App 端需微信开放平台移动应用，与小程序 openid 不互通，只能靠 unionid 打通）
- `snackShop` 改动需重新部署云函数才会生效
