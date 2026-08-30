# 查询中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将网页命令中心重构为按 ICCID/Profile 管理余额、余额历史、卡链接和周期计划的查询中心，同时保持 TG 等消息渠道命令与现有自动任务行为不变。

**Architecture:** 后端新增卡资料和余额计划存储，扩展余额查询为 Profile 感知并在完成时持久化余额变化；查询计划使用独立调度器，余额自动查询调用复用后的自动任务 Profile/环境执行器，续费提醒只调用现有通知分发逻辑。前端用新的 QueryCenterPage 替换网页命令 UI，保留 /commands 到 /query-center 的路由兼容跳转。

**Tech Stack:** Go、SQLite、现有 internal/balance、internal/store、internal/server、React 19、TypeScript、React Router、Tailwind、现有通知渠道和 Node node:test。

**Spec:** docs/superpowers/specs/2026-08-30-query-center-design.md

**Path convention:** backend paths are relative to the vofly-backend repository root; vofly/src and vofly/test paths are relative to the sibling vofly frontend repository root.

## Global Constraints

- 仅网页命令中心改为查询中心；Telegram、QQ、微信、企微 Bot 命令和后端通用命令接口保持兼容。
- 卡资料、余额历史和计划按 iccid + profile_aid 隔离；实体 SIM 的 profile_aid 为空。
- 非当前激活 Profile 的查看不切卡；立即查询和余额自动查询按现有自动任务逻辑切卡，完成后目标 Profile 保持激活并恢复目标卡原有网络策略。
- 续费/保号提醒不执行 USSD/SMS、不切卡；余额自动查询才执行余额查询。
- 通知行为与自动任务一致：发送到所有已配置并启用的通知渠道；本计划不增加渠道选择字段。
- 自定义链接只允许 HTTP(S)，提供编辑、保存和恢复默认；知识库可以保存多条链接。
- 不新增第三方依赖；代码文件保持 UTF-8、LF；所有提交信息使用中文。

---

### Task 1: 建立卡资料、余额计划和 Profile 感知余额数据模型

**Files:**
- Modify: vofly-backend/internal/store/models.go
- Modify: vofly-backend/internal/store/migrations.go
- Modify: vofly-backend/internal/store/balance.go
- Modify: vofly-backend/internal/balance/types.go
- Modify: vofly-backend/internal/balance/store_adapter.go
- Create: vofly-backend/internal/store/card_resources.go
- Create: vofly-backend/internal/store/balance_plans.go
- Test: vofly-backend/internal/store/card_resources_test.go
- Test: vofly-backend/internal/store/balance_plans_test.go
- Test: vofly-backend/internal/balance/service_test.go

**Interfaces:**
- Produces store.CardResource, store.KnowledgeLink, store.BalancePlan, and balance.Query.ProfileAID/change fields for later API and scheduler tasks.
- Store lookups use iccid and profileAID together and never fall back to device ID.

- [ ] **Step 1: Write failing storage and migration tests**

Create two records with the same ICCID and different Profile AIDs. Assert that reading, updating, resetting, and listing one Profile never returns the other Profile's data. Add balance query fixtures with profile_aid and assert all new fields round-trip.

Run:

~~~powershell
go test ./internal/store ./internal/balance -run 'Test(CardResource|BalancePlan|BalanceQueryProfile)' -count=1
~~~

Expected: FAIL because the new models, migration, and store methods do not exist.

- [ ] **Step 2: Add the schema migration and concrete store models**

Add the next migration after the current schema version. Create card_resources with composite primary key (iccid, profile_aid), profile metadata, carrier_mcc/carrier_mnc/carrier_spn, recharge_url, renew_url, ordered knowledge_links_json, and timestamps. Add an index on iccid.

Create balance_plans with an integer ID, kind, target device/Profile fields, interval/start/time/timezone, enabled/notify, next/last execution fields, and an index on enabled plus next_run_at. Add profile_aid, previous_amount, change_amount, and change_direction to balance_queries while preserving existing rows with empty values.

- [ ] **Step 3: Implement store CRUD and Profile-aware balance persistence**

Implement card resource get/upsert/reset methods, JSON encoding/decoding for ordered knowledge links, balance plan CRUD/claim/update methods, and update every balance query select/insert/update/scan/argument path to include profile_aid and change fields. Change pending-query uniqueness and inbound lookup to use both ICCID and Profile AID where supplied.

When completing a parsed balance query, calculate the previous same-key, same-currency completed amount inside the same transaction, then write previous_amount, change_amount, and change_direction. Leave them empty when either amount cannot be parsed exactly or currencies differ.

- [ ] **Step 4: Run focused tests and commit**

Run:

~~~powershell
go test ./internal/store ./internal/balance -run 'Test(CardResource|BalancePlan|BalanceQueryProfile|Balance)' -count=1
go test ./internal/store ./internal/balance -count=1
~~~

Expected: PASS. Commit only the model, migration, store, balance model, and their tests:

~~~powershell
git add internal/store internal/balance
git commit -m "增加卡资料和余额计划数据模型"
~~~

### Task 2: Implement default card resources and card-resource API

**Files:**
- Create: vofly-backend/internal/cardresource/defaults.go
- Create: vofly-backend/internal/cardresource/defaults_test.go
- Create: vofly-backend/internal/server/query_center_api.go
- Modify: vofly-backend/internal/server/general_api.go
- Create: vofly-backend/internal/server/query_center_api_test.go

**Interfaces:**
- cardresource.Defaults(identity) returns Red Pocket defaults and safe generic fallbacks.
- GET/PUT/DELETE /query-center/cards/:iccid use profile_aid as a query parameter for eSIM resources and an empty value for physical SIM resources.

- [ ] **Step 1: Add default-resource tests**

Test Red Pocket matching by SPN and MCC/MNC, unknown-carrier fallback, and URL validation. Assert the Red Pocket default contains exactly https://www.redpocket.com/ as the recharge entry and does not mark a balance evidence URL as a recharge URL.

Run:

~~~powershell
go test ./internal/cardresource ./internal/server -run 'Test(DefaultCardResource|QueryCenterCardResource)' -count=1
~~~

Expected: FAIL because the package, handlers, and routes do not exist.

- [ ] **Step 2: Implement default and effective-resource resolution**

Define bounded resource types for recharge_url, renew_url, and ordered title/url knowledge links. Resolve effective data as stored custom values first, then operator defaults, then generic official links, then empty values. Validate every custom URL with url.ParseRequestURI, requiring http or https and a host; reject empty titles, malformed links, overlong fields, and more than the documented maximum link count.

- [ ] **Step 3: Add card-resource handlers and routes**

Implement:

~~~text
GET    /query-center/cards/:iccid?profile_aid=...
PUT    /query-center/cards/:iccid?profile_aid=...
DELETE /query-center/cards/:iccid/defaults?profile_aid=...
~~~

The GET response includes effective and defaults plus whether stored custom data exists. PUT persists only the specified ICCID/Profile key. DELETE removes that key and returns the newly effective defaults. Audit events must not log notification secrets or private data.

- [ ] **Step 4: Run API tests and commit**

Run:

~~~powershell
go test ./internal/cardresource ./internal/server -run 'Test(DefaultCardResource|QueryCenterCardResource)' -count=1
go test ./internal/server -count=1
~~~

Expected: PASS. Commit:

~~~powershell
git add internal/cardresource internal/server
git commit -m "增加查询中心卡资料接口"
~~~

### Task 3: Add Profile-aware balance query API and reusable automatic execution boundary

**Files:**
- Modify: vofly-backend/internal/balance/service.go
- Modify: vofly-backend/internal/balance/types.go
- Modify: vofly-backend/internal/balance/store_adapter.go
- Modify: vofly-backend/internal/server/balance_api.go
- Modify: vofly-backend/internal/server/automatic_tasks.go
- Create: vofly-backend/internal/server/profile_execution.go
- Create: vofly-backend/internal/server/profile_execution_test.go
- Create: vofly-backend/internal/server/query_center_balance_test.go

**Interfaces:**
- profile_execution.go exposes one server-private execution boundary accepting device ID, Profile ICCID/AID, and an operation callback; it returns the active physical device and restores the target Profile's saved environment with current automatic-task semantics.
- POST /query-center/balance-queries accepts device_id, iccid, and profile_aid and returns the existing balance query shape with Profile/change fields.
- GET /query-center/balance-queries?iccid=...&profile_aid=... lists history for the card key.

- [ ] **Step 1: Write failing execution and API tests**

Add a fake device/eSIM controller test proving an inactive target Profile is switched before the callback, the callback sees the target ICCID, the target remains active afterward, and the target card policy/network state is restored. Add handler tests for missing device, invalid Profile, pending query, and successful target request.

Run:

~~~powershell
go test ./internal/server -run 'Test(ProfileExecution|QueryCenterBalance)' -count=1
~~~

Expected: FAIL because the shared execution boundary and query-center routes do not exist.

- [ ] **Step 2: Extract the common automatic-task Profile/environment flow**

Move the behavior currently implemented by ensureAutomaticTaskProfile, prepareAutomaticTaskEnvironment, and restoreAutomaticTaskEnvironment behind the private boundary. Existing automatic-task calls must use it and retain automatic switching, target Profile remaining active, policy restoration, and combined operation/restoration errors.

- [ ] **Step 3: Extend balance service context and handlers**

Carry Profile AID through DeviceSnapshot, Query, repository calls, inbound matching, and JSON output. Add query-center POST/GET handlers and route them from general_api.go. The POST handler invokes the shared execution boundary only when the selected Profile is not active, then calls balances.StartQuery; it does not use the command-center execution API.

- [ ] **Step 4: Run regression tests and commit**

Run:

~~~powershell
go test ./internal/balance ./internal/server -run 'Test(ProfileExecution|QueryCenterBalance|Balance)' -count=1
go test ./internal/balance ./internal/server -count=1
~~~

Expected: PASS, including existing automatic-task tests. Commit:

~~~powershell
git add internal/balance internal/server
git commit -m "支持查询中心按 Profile 查询余额"
~~~

### Task 4: Add card-level balance plan storage, scheduler, and notifications

**Files:**
- Modify: vofly-backend/internal/store/balance_plans.go
- Create: vofly-backend/internal/server/balance_plans.go
- Create: vofly-backend/internal/server/balance_plans_test.go
- Modify: vofly-backend/internal/server/server.go
- Modify: vofly-backend/internal/server/query_center_api.go
- Modify: vofly-backend/internal/server/automatic_task_notifications.go to expose the shared enabled-channel dispatch helper
- Create: vofly-backend/internal/server/balance_plan_notifications.go

**Interfaces:**
- POST/GET/PUT/DELETE /query-center/balance-plans uses kind balance_query or renewal_reminder, target device/Profile, interval, start date, run time, timezone, enabled, and notify.
- POST /query-center/balance-plans/:id/run queues one immediate execution.
- StartBalancePlans(ctx) starts one per-server scheduler; it claims due plans atomically and serializes execution per device.

- [ ] **Step 1: Write failing scheduler tests**

Test timezone-aware next-run calculation, atomic claim of one due plan, restart-safe next-run advancement, invalid kind/timezone/interval rejection, and the distinction:

~~~text
balance_query       -> automatic Profile execution + balance query
renewal_reminder    -> notification only
~~~

Use fake balance, Profile execution, and notification dependencies so tests do not touch hardware or external URLs.

Run:

~~~powershell
go test ./internal/server -run 'TestBalancePlan' -count=1
~~~

Expected: FAIL because the scheduler and plan API do not exist.

- [ ] **Step 2: Implement plan validation, CRUD routes, and durable claiming**

Validate target device, Profile fields, plan kind, interval range 1..365, YYYY-MM-DD start date, HH:MM run time, and IANA timezone. Advance next_run_at transactionally before dispatching work, so a restart cannot claim the same occurrence twice. Persist last_run_at, last_status, and last_error for both success and failure.

- [ ] **Step 3: Implement plan execution and notification formatting**

For balance_query, invoke the shared Profile execution boundary and existing balance service. For renewal_reminder, build a card-specific reminder containing card/Profile label, configured interval, and scheduled time without switching or querying. When notify is true, iterate the same enabled-channel list and call existing channel senders; one failure is logged and does not stop other channels. Do not alter TG command registration or automatic-task notification semantics.

- [ ] **Step 4: Wire startup, immediate run, and failure/restart paths**

Start the scheduler during server initialization alongside existing automatic tasks. Add tests for offline devices, missing Profile, query timeout, notification failure, service restart, and a successful 360-day reminder. Verify due-plan progression remains correct after each outcome.

- [ ] **Step 5: Run backend verification and commit**

Run:

~~~powershell
go test ./internal/store ./internal/balance ./internal/server -count=1
go vet ./internal/store ./internal/balance ./internal/server
~~~

Expected: PASS. Commit:

~~~powershell
git add internal/store internal/balance internal/server
git commit -m "增加余额自动查询和卡级提醒"
~~~

### Task 5: Add frontend query-center data helpers

**Files:**
- Modify: vofly/src/types.ts
- Create: vofly/src/lib/queryCenter.ts
- Create: vofly/test/queryCenter.test.mjs

**Interfaces:**
- Add TypeScript types for CardResource, KnowledgeLink, BalancePlan, BalanceQuery Profile/change fields, and query-center responses.
- queryCenter.ts provides pure helpers for card keys, effective link lists, balance change labels, plan-kind labels, and route search parameters.

- [ ] **Step 1: Write failing pure-helper tests**

Use the existing TypeScript transpile-by-data-URL pattern from test/commandCenter.test.mjs. Test that card keys distinguish physical SIM from eSIM AIDs, custom resources replace defaults, reset returns defaults, and balance changes map to increase/decrease/unchanged/unknown.

Run:

~~~powershell
npm test -- --test-name-pattern "query-center"
~~~

Expected: FAIL because the helper and test do not exist.

- [ ] **Step 2: Add types and pure helpers**

Define API-facing fields in camelCase matching api.ts conversion behavior. Centralize URL builders so each request includes iccid and optional profile_aid without divergent hand-built query strings.

- [ ] **Step 3: Run frontend contract tests**

Run:

~~~powershell
npm test -- --test-name-pattern "query-center"
~~~

Expected: PASS. Commit the types, helpers, and test:

~~~powershell
git add src/types.ts src/lib/queryCenter.ts test/queryCenter.test.mjs
git commit -m "增加查询中心前端数据契约"
~~~

### Task 6: Replace web command UI with the three-column query center

**Files:**
- Create: vofly/src/pages/QueryCenterPage.tsx
- Create: vofly/src/components/query-center/CardContextList.tsx
- Create: vofly/src/components/query-center/BalancePanel.tsx
- Create: vofly/src/components/query-center/CardLinksPanel.tsx
- Create: vofly/src/components/query-center/BalancePlansPanel.tsx
- Modify: vofly/src/App.tsx
- Modify: vofly/src/components/shell/AuthenticatedShell.tsx
- Modify: vofly/src/lib/i18n-en.ts
- Delete: vofly/src/pages/CommandsPage.tsx
- Delete: vofly/src/lib/commandCenter.ts
- Delete: vofly/test/commandCenter.test.mjs

**Interfaces:**
- QueryCenterPage loads /devices, the selected device eSIM inventory, card resources, balance history, and plans; it owns selected device/card/menu state and URL synchronization.
- Child panels receive one selected CardContext and callbacks for reload, save, reset, query, plan mutation, and external-link navigation.

- [ ] **Step 1: Build the device/Profile selection shell**

Implement the SMS-style desktop three-column layout and mobile drill-down state. Show physical SIM as one context and eSIM Profiles grouped by EID. Selecting a Profile loads its data but never calls the Profile-switch endpoint. Preserve device, iccid, profile_aid, and menu in search parameters.

- [ ] **Step 2: Implement the balance panel**

Show current parsed balance, last change, query state, and history. Add 立即查询 that posts the selected device/Profile, disables duplicate clicks while pending, refreshes history, and surfaces backend errors for offline devices, missing rules, pending query, and failed switching. Add a compact link to the automatic-query plan form.

- [ ] **Step 3: Implement resource and knowledge panels**

Add editable recharge and renewal URLs, a multi-row ordered knowledge list, save and reset actions, validation feedback, and external-link buttons. Use effective/default/custom state from the API so reset immediately reflects operator defaults. Never store values in localStorage.

- [ ] **Step 4: Implement both plan forms**

Provide separate forms for balance_query and renewal_reminder with name, interval days, start date, run time, timezone, enabled, and notify. Display next/last run and last error. Do not expose channel selection or automatic switching as configurable options because those behaviors are fixed by the agreed backend semantics.

- [ ] **Step 5: Remove obsolete command-center web code and run UI checks**

Remove imports and references to command definitions, SSE events, slash input, high-risk actions, command history clearing, and WindowConsoleRegular from the web query-center path. Do not remove command descriptions from Bot settings. Run:

~~~powershell
npm test
npm run build
~~~

Expected: PASS with no command-center web test remaining and no TypeScript errors. Commit:

~~~powershell
git add src test
git commit -m "将网页命令中心改为查询中心"
~~~

### Task 7: Full regression, visual verification, and release handoff

**Files:**
- No planned source changes; this task is verification and scope review only.

- [ ] **Step 1: Run backend complete verification**

From vofly-backend:

~~~powershell
go test ./...
go vet ./...
~~~

Expected: PASS. Confirm existing automatic-task and message-channel command tests remain unchanged and pass.

- [ ] **Step 2: Run frontend complete verification**

From vofly:

~~~powershell
npm test
npm run build
~~~

Expected: PASS. Confirm the production bundle contains the query-center route and no import of CommandsPage or commandCenter.ts.

- [ ] **Step 3: Run browser smoke verification**

Start the frontend dev server on an unused local port and use Playwright to check desktop and mobile layouts. Verify device -> Profile -> menu navigation, inactive Profile query payload, reset-default behavior, multiple knowledge links, 360-day reminder form, and empty/error/loading states. Capture screenshots only for visual debugging; do not deploy or restart the user's remote VM in this plan.

- [ ] **Step 4: Review scope and report residual risks**

Run git status --short in both repositories. Confirm no prior user changes were staged, no TG command files changed, and no generated build output was committed. Report hardware-only validation separately from passing unit/build checks.
