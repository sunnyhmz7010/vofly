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

## 临时待办：查询中心重构（7 个任务全部未开始，完成后删除本节）

原实施计划文件（仓库根 2026-08-30-query-center.md，GBK 编码乱码）已删除；其引用的规格文档 docs/superpowers/specs/2026-08-30-query-center-design.md 在两仓均已不存在。本节是经代码核查后的压缩版完整计划：后端无任何 card_resources / balance_plans / profile_aid 痕迹，前端无 queryCenter 代码，进度 0%。

**目标**：把网页命令中心重构为查询中心——按 ICCID/Profile 管理卡资料、余额、余额历史、卡链接与周期计划；TG/QQ/微信/企业微信 Bot 命令与现有自动任务行为保持不变。

**全局约束**：

- 卡资料、余额历史、计划一律按 (iccid, profile_aid) 隔离；实体 SIM 的 profile_aid 为空串；存储查找不得回退到设备 ID。
- 查看非激活 Profile 不切卡；立即查询与余额自动查询按现有自动任务逻辑切卡，完成后目标 Profile 保持激活并恢复其原有网络策略。
- 续费/保号提醒不执行 USSD/SMS、不切卡；只有 balance_query 计划真正执行余额查询。
- 通知发送到所有已配置且启用的渠道（复用现有分发逻辑），不新增渠道选择字段。
- 自定义链接仅允许 HTTP(S)，可编辑/保存/恢复默认；知识链接为有序多条。
- 不新增第三方依赖；文件 UTF-8 + LF；提交信息中文。后端改动在私有仓 vofly-backend（与前端同级克隆，有自己的 AGENTS.md）。

**Task 1 后端数据模型（vofly-backend）**

- 改 internal/store/{models.go,migrations.go,balance.go}、internal/balance/{types.go,store_adapter.go}；新建 internal/store/card_resources.go、balance_plans.go 及对应 _test。
- 迁移：card_resources 复合主键 (iccid, profile_aid)，含 Profile 元数据、carrier_mcc/mnc/spn、recharge_url、renew_url、有序 knowledge_links_json、时间戳、iccid 索引；balance_plans 含整型 ID、kind、目标设备/Profile、interval/start/time/timezone、enabled/notify、next/last 执行字段、(enabled,next_run_at) 索引；balance_queries 增 profile_aid、previous_amount、change_amount、change_direction（旧行空值兼容），pending 唯一性与入站匹配改为 ICCID+Profile AID。
- 余额解析完成落库时，同事务内取上一次同 key 同币种完成金额计算变化字段；任一金额解析不出或币种不同则留空。
- 验证 `go test ./internal/store ./internal/balance -count=1`；提交信息「增加卡资料和余额计划数据模型」。

**Task 2 后端卡资料默认值与 API**

- 新建 internal/cardresource/defaults.go(+_test)、internal/server/query_center_api.go(+_test)；改 general_api.go 注册路由。
- cardresource.Defaults(identity)：Red Pocket 按 SPN + MCC/MNC 匹配，默认充值入口恰为 https://www.redpocket.com/（余额查询证据 URL 不算充值 URL）；未知运营商安全兜底。
- 路由：GET/PUT /query-center/cards/:iccid?profile_aid=… 与 DELETE /query-center/cards/:iccid/defaults?profile_aid=…；GET 返回 effective + defaults + 是否存在自定义；有效值优先级：存储自定义 > 运营商默认 > 通用官方链接 > 空；用 url.ParseRequestURI 校验（仅 http/https 且有 host），拒绝空标题、畸形链接、超长字段、超上限链接数；审计不记录通知密钥与隐私。
- 提交信息「增加查询中心卡资料接口」。

**Task 3 后端 Profile 感知余额查询 + 可复用执行边界**

- 改 internal/balance/{service.go,types.go,store_adapter.go}、internal/server/{balance_api.go,automatic_tasks.go}；新建 internal/server/profile_execution.go(+_test)、query_center_balance_test.go。
- 把 automatic_tasks.go 已有的 ensureAutomaticTaskProfile / prepareAutomaticTaskEnvironment / restoreAutomaticTaskEnvironment（约 :229/:278/:516）行为抽成 server 私有执行边界（入参：设备 ID、目标 Profile ICCID/AID、操作回调；返回活跃物理设备并按现有语义恢复目标卡网络状态），现有自动任务改为调用它且语义不变。
- balance 全链路（DeviceSnapshot、Query、仓储、入站匹配、JSON 输出）携带 profile_aid；POST /query-center/balance-queries（device_id、iccid、profile_aid）仅当所选 Profile 非激活才切卡，然后调用现有 balances.StartQuery，不走命令中心执行 API；GET /query-center/balance-queries?iccid=…&profile_aid=… 列卡级历史。
- 验证 `go test ./internal/balance ./internal/server -count=1`（含既有自动任务回归）；提交信息「支持查询中心按 Profile 查询余额」。

**Task 4 后端余额计划存储、调度器与通知**

- 改 internal/store/balance_plans.go、internal/server/{server.go,query_center_api.go,automatic_task_notifications.go（把启用渠道分发抽成共享 helper）}；新建 internal/server/balance_plans.go(+_test)、balance_plan_notifications.go。
- API：POST/GET/PUT/DELETE /query-center/balance-plans，kind 仅 balance_query | renewal_reminder，校验目标设备/Profile、interval 1..365、YYYY-MM-DD 开始日期、HH:MM 执行时间、IANA 时区；POST /query-center/balance-plans/:id/run 立即执行一次。
- StartBalancePlans(ctx)：每 server 一个调度器，原子 claim 到期计划；事务内先推进 next_run_at 再派发（重启不重复领取）；按设备串行执行；持久化 last_run_at/last_status/last_error（成败都记）。
- 执行：balance_query → 共享执行边界 + 现有余额服务；renewal_reminder → 仅构造卡级提醒（卡/Profile 标签、配置间隔、计划时间），不切卡不查询。notify 为真时遍历启用渠道发送，单渠道失败仅记日志不中断；不改 TG 命令注册与自动任务通知语义。
- 服务启动时随现有自动任务一起拉起；补离线设备、缺 Profile、查询超时、通知失败、服务重启、360 天提醒等用例。
- 验证 `go test ./internal/store ./internal/balance ./internal/server -count=1` 与 `go vet`；提交信息「增加余额自动查询和卡级提醒」。

**Task 5 前端数据契约（本仓库）**

- 改 src/types.ts；新建 src/lib/queryCenter.ts、test/queryCenter.test.mjs。
- 类型用 camelCase（配合 api.ts 自动转换）：CardResource、KnowledgeLink、BalancePlan，BalanceQuery 增 profileAid、previousAmount、changeAmount、changeDirection。
- queryCenter.ts 纯 helper：卡 key（区分实体 SIM 与 eSIM AID）、有效链接合并（自定义替换默认）、余额变化标签（increase/decrease/unchanged/unknown）、plan kind 标签、统一 URL 构造（iccid + 可选 profile_aid，禁止散落手拼 query string）。
- 测试沿用 transpile-data-URL 模式（参照 test/commandCenter.test.mjs）。提交信息「增加查询中心前端数据契约」。

**Task 6 前端三栏查询中心**

- 新建 src/pages/QueryCenterPage.tsx、src/components/query-center/{CardContextList,BalancePanel,CardLinksPanel,BalancePlansPanel}.tsx；改 App.tsx、AuthenticatedShell.tsx、i18n-en.ts；删除 src/pages/CommandsPage.tsx、src/lib/commandCenter.ts、test/commandCenter.test.mjs。
- SMS 风格桌面三栏 + 移动端下钻；实体 SIM 一个上下文、eSIM Profile 按 EID 分组；查看 Profile 只加载数据绝不切卡；设备/iccid/profile_aid/menu 同步进 URL search 参数；保留 /commands → /query-center 的兼容跳转。
- 余额面板：当前解析余额、最近变化、查询状态、历史；「立即查询」POST 所选设备/Profile、pending 时防重复点击、刷新历史、透出离线/缺规则/pending/切卡失败错误；附自动查询计划表单的紧凑入口。
- 卡资料面板：可编辑充值/续费 URL、有序知识链接多行、保存/恢复默认（恢复后即时反映运营商默认值）、校验反馈、外链按钮；不落 localStorage。
- 两种计划表单（balance_query / renewal_reminder）：名称、间隔天数、开始日期、执行时间、时区、启用、通知；展示 next/last run 与 last_error；不暴露渠道选择与切卡开关（后端语义固定）。
- 新文案同步补 i18n-en.ts 词条；清除网页命令中心残留（命令定义、SSE 事件、斜杠输入、高危动作、WindowConsoleRegular），Bot 设置里的命令描述保留。
- 验证 `npm test` + `npm run build`（产物含 /query-center 路由、无 CommandsPage/commandCenter 导入）；提交信息「将网页命令中心改为查询中心」。

**Task 7 回归与验收**

- 后端 `go test ./...` + `go vet ./...`，确认既有自动任务与消息渠道命令测试不变且通过。
- 前端 `npm test` + `npm run build`。
- Playwright 浏览器 smoke（桌面 + 移动布局）：设备 → Profile → 菜单导航、非激活 Profile 查询载荷、恢复默认、多条知识链接、360 天提醒表单、空/错/载入态；截图仅用于调试，不部署、不重启远程 VM。
- 两仓 `git status --short` 复查：无误入暂存、未改 TG 命令文件、未提交构建产物；硬件相关验证单独汇报。完成后删除本节。
