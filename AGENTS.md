# vofly 项目 AGENTS.md

## 角色定位

你是 `vofly` 前端仓库的维护协作者。默认使用简体中文沟通，优先给出清晰判断、可执行方案和必要依据。目标是在安全、正确、可维护的前提下，用最小必要改动解决当前明确问题。

技术栈基线：React 19 + TypeScript（strict）+ Vite 7 + Tailwind CSS 3 的 SPA，配套 Linux 安装/升级/卸载 shell 脚本；测试只用 Node 内置 `node:test`，无 Jest/Vitest。

## 仓库边界

- `vofly` 是前端仓库，只负责 Web UI、前端状态、前端测试和前端安装/发布脚本。
- `vofly-backend` 是后端仓库（私有），只负责 API、服务端逻辑、数据库、守护进程和后端测试。
- 前后端改动默认分开提交、分开推送、分开发布。
- 需要同时改前后端时，必须分别在对应仓库完成；不要在一个仓库里代改另一个仓库的职责。

## 基本约束

- 原则优先级：安全性 = 正确性 > 最小变更 > 可读性 > 一致性。
- 严格从原始需求出发，不擅自扩展范围。
- 先理解现有架构、目录分层、技术栈与业务语义，再动手修改。
- 保持既有架构和实现风格；非必要不调整目录结构、公共接口和技术选型。
- 优先使用已有依赖、标准库和原生能力；新增依赖前必须说明理由。
- 仅修改用户请求直接相关的代码，绝不清理无关内容。
- 提交前确认只包含本次目标文件，不带入本地环境文件或用户已有改动。

## 技术栈与常用命令

- Node >= 20；包管理一律用 npm（CI 以 `package-lock.json` 为准，依赖用 `npm ci` 安装；根目录 `pnpm-workspace.yaml` 只是 esbuild 构建脚本批准占位，不是包管理约定）。
- `npm test`：`node --test test/*.test.mjs`，秒级完成，任何改动后都必须跑。
- `npm run build`：先对 `tsconfig.app.json` / `tsconfig.node.json` 各做一轮 `tsc --noEmit`，再 `vite build` 产出 `dist/`；涉及类型、导入、构建配置或发布物时必须跑。
- `npm run dev`：Vite 开发服务器 127.0.0.1:5173，`/api` 代理到本机后端 `127.0.0.1:7575`。
- 关键依赖：react-router-dom v7（路由）、echarts 6（图表，统一走 `components/EChart.tsx` 封装）、qrcode + jsqr（二维码发送/识别）、@fluentui/react-icons 与 lucide-react（图标）、@fontsource 系列字体。无全局状态库、无 axios 等请求库，fetch 封装集中在 `src/api.ts`。

## 目录结构

```text
vofly/
├── src/
│   ├── api.ts               # 唯一后端调用层：fetch 封装、CSRF、camel/snake 转换、ApiError、SSE URL
│   ├── types.ts             # 全部后端 DTO 的 TypeScript 类型（单一出处）
│   ├── extensions.ts        # 插件/扩展系统前端接口
│   ├── App.tsx              # 路由表、主题 hook、RequireAuth 守卫
│   ├── main.tsx             # 入口：字体、BrowserRouter、全局样式
│   ├── components/
│   │   ├── shell/           # 登录前/后外壳：侧边栏导航、品牌、版本徽章
│   │   ├── ui/              # 基础组件库（Button/Modal/Select/Switch/Tabs/message/MessageBox 等）
│   │   ├── dashboard/       # 仪表盘卡片（主机信息/性能、在线率、待执行任务）
│   │   ├── devices/         # 设备列表/详情/配置/eSIM/卡策略/AT/USSD 组件与纯逻辑（cardPolicyPresentation、shared.ts）
│   │   ├── sms/             # 短信会话组件与 smsApi/smsText
│   │   ├── proxy/           # 上游代理、国家规则、设备绑定
│   │   ├── settings/        # 设置页卡片与通知渠道表单（model.ts 为设置纯逻辑）
│   │   └── logs/            # 日志保留策略卡片
│   ├── pages/               # 页面级组件，与路由一一对应
│   ├── store/auth.tsx       # AuthProvider：全局会话上下文（唯一的类全局状态）
│   └── lib/
│       ├── i18n.tsx / i18n-en.ts   # 中文为键的 i18n 机制与英文字典
│       ├── qtx1w/           # QTX1-W 二维码文件传输协议（protocol/receiver/qrWorker/playback/sha256/mime）
│       ├── mccmnc.json      # MCC/MNC 离线运营商表，勿手改
│       └── phoneLease.ts / notificationOnboarding.ts / usePolling.ts / carrier.ts / utils.ts 等
├── test/                    # node:test 测试：纯逻辑单测 + 源码守卫
├── public/                  # 静态资源：图标、国旗 SVG、sw.js（离线缓存）、theme-init.js
├── .github/workflows/       # ci.yml（测试+构建）、cd.yml（Release 构建发布）
├── install.sh / update.sh / uninstall.sh   # Linux 一键安装/升级/卸载脚本
└── vite.config.ts / tailwind.config.js / tsconfig*.json
```

## 前端架构约定

### 后端调用层（src/api.ts）

- 所有请求必须走 `api<T>(path, options)`，不要散落 `fetch`；路径自动补 `/api` 前缀，`credentials: "include"`。
- 传输层 snake_case ↔ 前端 camelCase 自动双向转换；成功响应自动解 `{ data }` 信封。新增接口字段按后端 snake_case 语义在 `src/types.ts` 补类型。
- CSRF：token 存 `sessionStorage("vofly.csrf")`，变更类请求自动带 `X-CSRF-Token`；403 `invalid_csrf` 自动刷新重试一次。
- 401 统一触发 `notifyUnauthorized()`：清 token 并派发 `window` 事件 `vofly:unauthorized`，AuthProvider 监听后清空会话；不要在各页面自写登出跳转。
- 错误统一抛 `ApiError`（status/code/requestId），UI 用 `apiMessage()` 生成文案。
- 实时数据两条通道：SSE 用 `new EventSource(eventStreamURL(...))`（见 LogsPage `/logs/stream`、CommandsPage `/command-center/stream`）；轮询用 `usePolling`（页面隐藏自动暂停）。按场景选用，不要混用。

### 认证

- 纯密令登录：`/auth/login { secret }`，会话由后端 Cookie 管理，前端只持有 CSRF token。
- 除 `/login` 与 `/qr-receive` 外，所有路由都包在 `RequireAuth` 守卫内。

### i18n（src/lib/i18n.tsx）

- 中文为键：UI 文案直接写中文，英文模式经 `t()` 查 `i18n-en.ts` 的 `EN_DICT`，查不到回退中文原文。
- 新增或修改任何用户可见文案，必须同步在 `i18n-en.ts` 补词条；非组件代码用 `tl()` / `tf()`（`tf` 支持 `{占位}` 插值）。
- 语言偏好存后端 `/settings/preferences`，不写 localStorage。

### 路由与页面

- 认证内路由：`/`（仪表盘）、`/devices/*`、`/phone`（通话）、`/sms`、`/proxy`、`/export-proxy`（条件显示）、`/commands`、`/automatic-tasks`、`/extensions/:pluginId/:contributionId`、`/logs`、`/settings`；独立路由 `/login`、`/qr-receive`（免登录离线扫码接收页）。
- 新增页面：`pages/` 建组件 → `App.tsx` 注册路由 → `AuthenticatedShell.tsx` 导航表加条目（label 写中文）→ `i18n-en.ts` 补词条。侧边栏顺序有守卫测试锁定（短信在通话之前）。

### 样式与主题

- Tailwind 3，暗色为 `class` 策略（`documentElement` 的 `dark` class），偏好存 `localStorage("theme")`；`index.html` 引入的 `theme-init.js` 负责首帧防闪烁。
- 品牌色是浅蓝：`tailwind.config.js` 把整组 `indigo-*` 色阶重映射为 sky。因此 JSX 里写 `indigo-500` 就是品牌色，不要为换色去全局替换类名。

### QTX1-W 二维码文件传输（src/lib/qtx1w）

- 移植自 SeigaeLeo/offline-qr-file-transfer（GPL-3.0）。帧结构 `QTX1 + 类型(S/D/R/W/E) + 10 位会话 ID + Base36 序号/总数 + CRC32 + Base45 载荷`，XORSHIFT32 载荷白化；单文件上限 25 MiB，分片 100–2800 字节。
- 发送端 `QrSendModal` + `qrWorker.ts`（Web Worker 内生成二维码帧，qrcode 库）；接收端 `QrReceivePage`（jsqr 扫码）。
- `public/sw.js` 只为 `/qr-receive` 场景做离线缓存；改动外壳或资源后需递增 `CACHE_VERSION` 才能刷新旧客户端缓存。

### 设备域模型

- 设备类型固定四种：`wifi_410` / `dji_4g` / `pcie_ec20_ec25` / `usb_sim_reader`（`lib/deviceTypes.ts`）；设备后端通道 `at` / `qmi` / `pcsc`，eSIM 传输 `at` / `qmi` / `pcsc` / `none`。
- 卡策略互斥：漫游数据、VoWiFi、飞行模式三者不能同时开启；互斥判定只实现在 `components/devices/cardPolicyPresentation.ts` 的 `isCardPolicyModeDisabled`，改规则必须过 `cardPolicyModes` 测试。
- 运营商识别走 `lib/mccmnc.json` 离线表（`lookupCarrier` / `carrierIso`，按 IMSI 解析），运行时不依赖外部查询服务。
- 通话页单标签页控制租约：`lib/phoneLease.ts`——sessionStorage 存本页声明，localStorage 镜像持有者并靠 storage 事件广播；心跳 2s、陈旧 6s、最新声明胜出。多标签页语义改动需同步 `phoneControlLease` 测试。

### 通知渠道

- 渠道清单见 `types.ts` 的 `NotificationSettings`（telegram/qq/weixin/wecom/feishu/webhook/bark/email/pushplus/meow 等）。
- 交互式渠道（weixin/wecom-bot/qq/feishu-bot）的扫码绑定向导统一走 `lib/notificationOnboarding.ts` 的 `useNotificationQR`（start/status/cancel 契约有守卫测试）。
- 设置表单的装载/组包纯逻辑集中在 `components/settings/model.ts`（`notificationSettingsModel` 测试覆盖）。

## 测试约定（test/）

- 只用 `node:test` + `node:assert/strict`，一主题一文件，文件名即主题。
- 两类写法：
  1. 纯逻辑单测：`ts.transpileModule` 编译目标 .ts 源码 → base64 data URL `import` → 断言行为（如 cardPolicyModes、commandCenter、automaticTaskProfiles）。被测逻辑必须是零 DOM 依赖的小模块。
  2. 源码守卫：直接 `readFile` 源码文本做正则断言，锁定 UI 结构、中文文案、品牌词与安装脚本布局（如 uiShell、installerScripts、restrictionRemnants、qrWavTransfer）。
- 推论：可测的业务判断要抽成纯函数模块；改到守卫覆盖的结构/文案/脚本时，必须同步更新对应守卫测试，不得删断言绕过。
- 很多产品决策以守卫测试形式存在（登录页回车提交、顶栏登出按钮、禁止旧品牌标语与副标题、安装器参数布局等），动 UI 或脚本前先看相关守卫。

## CI/CD 与发布

- CI（`.github/workflows/ci.yml`）：push/PR 到 main → `npm ci` + `npm test` + `npm run build`（Node 20）。
- CD（`.github/workflows/cd.yml`）：在本仓库发布 GitHub Release 时触发——构建前端 dist → 检出私有后端仓库 `sunnyhmz7010/vofly-backend`（需 `BACKEND_REPO_TOKEN` secret）→ dist 嵌入 `backend/web/dist` → Go 交叉编译 linux amd64/arm64/armv7 → 二进制 + SHA256SUMS 传回同一 Release。
- 因此前端发布的唯一动作是打 Release；本地不要构建 Go 二进制，也不要把 `dist/` 提交进仓库（已 gitignore）。
- `install.sh`：从 Release 下载二进制装到 `/opt/vofly`，写 `/etc/vofly/env` 与 systemd 服务，监听 `0.0.0.0:7575`，SQLite 在 `/opt/vofly/data/vofly.db`；首装生成仅终端显示一次的初始访问密令；`--with-pcsc` / `--with-ffmpeg` 选装依赖；新装的系统包记录到 `/etc/vofly/installed-packages`，卸载时按记录卸除。
- `update.sh` 原地升级到最新 Release；`uninstall.sh` 默认保留数据，`--purge` 才清库。
- 改安装/卸载脚本时，`installerScripts` 与 `qrWavTransfer` 中的安装器守卫测试（`npm test` 已覆盖）必须保持通过。

## 协作规则

- 前端改动如果依赖后端接口，先确认后端仓库已提供对应 API，再改前端调用和类型。
- 后端接口变更后，前端要同步更新调用层、类型定义和相关测试。
- 涉及发布时，前端仓库只处理前端 release、安装脚本、前端构建产物和 GitHub 发布信息。
- 后端仓库只处理服务端二进制、systemd、数据库迁移和后端 CI。
- 不要把两个仓库的发布流程混在一起。

## 执行与验证

- 修改前先看相关文件和现有测试。
- 变更后优先补最小必要测试，再检查构建或单测。
- 最低验证基线：改动后跑 `npm test`；涉及类型、导入、构建配置或发布物时加跑 `npm run build`。
- 不要凭感觉同时改很多层；先让当前层可编译、可运行，再扩展到下一层。
- 如果工作区已有无关脏改，必须避开，不要顺手整理。

## 提交规则

- 提交信息优先中文，简洁描述实际改动。
- 推送前先确认目标仓库和分支正确。
- 如果需要同时推动前后端变更，分别提交到各自仓库，再分别推送。

## 上游同步

本仓库从 [MengMengCode/VoCat](https://github.com/MengMengCode/VoCat) web 代码 fork 而来，需定期同步上游前端功能、UI 修复和安全补丁。
