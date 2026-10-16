# mobile · 邻里点单 React Native 端（最小骨架）

用于验证 **RN → 自建后端（server/）→ MongoDB** 全链路是否跑得通的最小可运行工程。
目标不是做完整 App，而是验证：RN 能否直连后端、用户名密码登录能否拿到身份、业务协议能否复用。

## 为什么是 Expo（React Native 原生）而不是 uni-app / Taro

| 方案 | 结论 |
| --- | --- |
| **Expo / RN 原生** | ✅ 采用。后端是标准 HTTP 接口，RN 用 `fetch` 直接调用，不需要任何厂商 SDK；项目已有 React Web 端，技术栈一致 |
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
│   ├── config.ts        # EXPO_PUBLIC_API_BASE 与校验
│   ├── client.ts        # HTTP 客户端：令牌、invoke、登录 / 注册
│   ├── session.ts       # 登录（账号密码 / 注册）与登录态
│   ├── api.ts           # 接口契约（与 h5/src、web/src 同协议）
│   ├── storage.ts       # MMKV 持久化（令牌与用户标识）
│   └── theme.ts         # 与小程序 app.wxss 对齐的设计 token
└── .env.example
```

## 跑起来

```bash
cd mobile
cp .env.example .env      # 填写 EXPO_PUBLIC_API_BASE（必须是完整地址）
npm install
npm run typecheck         # 类型检查
npm start                 # 随后按 a(iOS) / a(Android) 启动，或用 Expo Go 扫码
```

`.env` 改动后必须**重启** `expo start`，Expo 不会热更新环境变量。

### 后端地址怎么填

RN 的 `fetch` 不支持 `/api` 这种相对路径，必须写完整地址：

- 模拟器 / 真机与服务器同一局域网 → `http://192.168.1.100:3000/api`
- 线上 → `https://api.example.com/api`（必须 HTTPS，否则 iOS 的 ATS 会拦截）

App 不受浏览器同源策略限制，所以服务端 `CORS_ORIGIN` 对它不生效，
但别在网关层做来源过滤，否则会把 App 请求一起挡掉。

## 后端侧的身份

后端用 JWT 令牌识别用户：

1. 登录 / 注册 → 后端返回 `token` 与 `user.id`
2. 客户端把 `token` 存进 MMKV，每次请求带 `Authorization: Bearer <token>`
3. 需要登录的接口由服务端校验令牌，**不接受客户端传入的用户标识**，否则可伪造身份越权读写他人订单

游客（未登录）可访问只读接口：商品列表、广场帖子、闲置列表；写操作一律返回 401。
令牌过期或被吊销时客户端会清掉本地登录态并提示重新登录。

## 验证清单

在自检页逐项确认：

- [ ] 环境卡片显示已配置的 API 地址
- [ ] 注册或登录后，「当前身份」显示用户 ID
- [ ] 链路自检显示 `GET /products 返回 N 个商品`
- [ ] 菜单列表能渲染出商品名与价格（图片是 COS 直链）

若自检报「网络连接失败」，按顺序排查：
手机与服务器是否同一局域网、后端是否已启动、服务器防火墙是否放行端口、
`EXPO_PUBLIC_API_BASE` 是否填了完整地址（RN 不支持相对路径）。

## 已知限制（骨架阶段）

- 只做了只读链路：菜单 / 广场列表，没有下单、购物车、上传图片
- 未接入推送（RN 端无法复用小程序订阅消息，需另接极光 / 厂商通道）
- 未接入微信登录（App 端需微信开放平台移动应用，与小程序 openid 不互通，只能靠 unionid 打通）
- 后端接口改动需重启服务才会生效
