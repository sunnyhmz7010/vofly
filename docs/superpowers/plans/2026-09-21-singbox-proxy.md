# sing-box 协议代理与可选依赖网页管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在代理管理页增加 sing-box 协议代理父资源和自动生成的本地 SOCKS5 子资源，并把 PC/SC、ffmpeg、sing-box 的安装与卸载迁移到受控网页任务入口，同时保持安装脚本的主体服务流程不变。

**Architecture:** 后端新增 URI 解析器、sing-box 配置生成器和进程管理器；SQLite 保存协议父资源及其现有 SOCKS5 子资源关系。后端新增白名单依赖任务管理器，包管理器和 sing-box Release 下载都由固定参数执行，前端只轮询任务状态。前端顶部展示协议父资源，底部沿用现有 SOCKS5 绑定流程，设置页管理 PC/SC 与 ffmpeg，代理页管理 sing-box 二进制。

**Tech Stack:** Go 1.25、SQLite、`os/exec`、标准库 `net/url`/`encoding/json`、sing-box 外部二进制；React 19、TypeScript strict、Vite 7、Tailwind CSS 3、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-21-singbox-proxy-design.md`

## Global Constraints

- 首期 URI scheme 固定为 `vless://`、`vmess://`、`trojan://`、`ss://`、`socks5://`、`socks://`；订阅、整份 JSON、Hysteria2 和 TUIC 不在本次实现。
- 一条 URI 只创建一个父资源、一个 sing-box 进程和一个只读 SOCKS5 子资源；子资源继续作为国家规则和 Profile 绑定的唯一目标。
- sing-box inbound 只监听 `127.0.0.1`，必须启用 UDP；子资源的地址和管理字段不能由现有 SOCKS5 编辑接口修改。
- 安装脚本删除 `--with-pcsc` 与 `--with-ffmpeg` 参数和可选依赖自动安装调用；必要运行依赖、服务重启、校验和与回滚保持存在。
- 可选依赖任务只能使用后端固定的可执行文件、固定参数和固定包名；不接受前端提交的任意命令、包名或下载 URL。
- API 不回传原始 URI、UUID、密码或完整 outbound JSON；日志和错误消息不得包含敏感配置。
- 前端新增中文文案必须同步更新 `src/lib/i18n-en.ts`；后端和前端仓库分别测试、分别提交。

---

### Task 1: 后端 URI 解析与 sing-box 配置纯逻辑

**Files:**
- Create: `vofly-backend/internal/singbox/uri.go`
- Create: `vofly-backend/internal/singbox/uri_test.go`
- Create: `vofly-backend/internal/singbox/config.go`
- Create: `vofly-backend/internal/singbox/config_test.go`

**Interfaces:**
- Produces `ParseURI(raw string) (ProxySpec, error)` where `ProxySpec` contains `Protocol`, `DisplayName`, `Server`, `ServerPort`, `Outbound map[string]any`, and a redacted `Summary`.
- Produces `BuildConfig(spec ProxySpec, localPort int) ([]byte, error)` with a `socks` inbound at `127.0.0.1:localPort`, UDP enabled, and exactly one protocol outbound.
- Produces typed errors with codes `unsupported_protocol`, `invalid_uri`, `invalid_parameter`, and `unsupported_transport` for the server API.

- [ ] **Step 1: Write failing parser tests** for one valid VLESS TLS URI, one VLESS Reality + WebSocket URI, one VMess base64 JSON URI, one Trojan URI, SIP002 Shadowsocks, user/password SOCKS5, IPv6 host syntax, and unsupported scheme/invalid port/invalid UUID cases.
- [ ] **Step 2: Run the parser tests and verify they fail** with missing `ParseURI`/`ProxySpec` symbols rather than test setup errors.
- [ ] **Step 3: Implement parser and normalization** with `net/url`, strict host/port checks, URL decoding, VMess base64 JSON decoding, SIP002/base64 Shadowsocks decoding, and explicit mapping to sing-box outbound fields. Reject control characters, unknown required transport values, empty credentials, and fields longer than the API limits.
- [ ] **Step 4: Write failing config tests** asserting the inbound is `type=socks`, `listen=127.0.0.1`, the requested port is present, no inbound authentication is generated, and the parsed outbound is preserved without an extra direct route.
- [ ] **Step 5: Implement `BuildConfig`** with `log.level=warn`, one local SOCKS inbound, one parsed outbound tagged `proxy-out`, and no user-controlled listen address.
- [ ] **Step 6: Run `go test ./internal/singbox -v`** and confirm all parser/config cases pass without secrets appearing in summary output.

### Task 2: SQLite 父子资源存储

**Files:**
- Modify: `vofly-backend/internal/store/models.go`
- Modify: `vofly-backend/internal/store/migrations.go` (add migration 34)
- Modify: `vofly-backend/internal/store/proxy.go`
- Create: `vofly-backend/internal/store/singbox.go`
- Modify: `vofly-backend/internal/store/domain_test.go`
- Create: `vofly-backend/internal/store/singbox_test.go`

**Interfaces:**
- Adds `store.SingBoxProxy` with `ID`, `Name`, `Protocol`, `Config`, `LocalPort`, `UpstreamProxyID`, `Enabled`, timestamps.
- Adds `store.UpstreamProxy.ManagedBy`, `ManagedID` and `ReadOnly()`.
- Adds `CreateSingBoxProxy`, `SingBoxProxy`, `ListSingBoxProxies`, `UpdateSingBoxProxy`, `DeleteSingBoxProxy`, and `SetSingBoxEnabled` methods; creation must insert parent and child in one transaction.
- Adds `ListManagedUpstreamProxies` behavior through the existing `ListUpstreamProxies` result without changing manual rows.

- [ ] **Step 1: Add failing migration/store tests** that open a fresh database, create a parent with local port and normalized config, assert the generated upstream row has `managed_by=singbox`, then delete the parent and assert the child, country rules, and profile bindings are gone.
- [ ] **Step 2: Run `go test ./internal/store -run 'SingBox|Domain' -v`** and verify failure is caused by the absent table/methods.
- [ ] **Step 3: Add migration 34** for `singbox_proxies`, `managed_by`, and `managed_id`, with unique constraints, foreign keys, indexes, and defaults that preserve existing manual rows.
- [ ] **Step 4: Implement transactional store methods**; use `SecretMask` rules for returned upstream passwords, validate IDs/ports/config size, and reject attempts to create a second parent for the same child.
- [ ] **Step 5: Add cascade/compatibility tests** for manual SOCKS5 CRUD and managed child read-only metadata, then run the focused store tests again.

### Task 3: sing-box 进程运行时

**Files:**
- Create: `vofly-backend/internal/singbox/manager.go`
- Create: `vofly-backend/internal/singbox/manager_test.go`
- Modify: `vofly-backend/internal/server/server.go`
- Modify: `vofly-backend/cmd/vofly/main.go`

**Interfaces:**
- Adds `singbox.Manager` with `Start(ctx)`, `Close(ctx)`, `Apply(ctx, store.SingBoxProxy)`, `Stop(ctx, id)`, `RefreshBinary()`, and `Status(id) RuntimeStatus`.
- Adds server-facing `SingBoxController` methods `ListStatuses`, `Apply`, `Stop`, and `RefreshBinary`.
- The manager receives `store` access, logger, data directory, binary path (`VOFLY_SING_BOX_PATH` or `/opt/vofly/bin/sing-box`), and a clock/backoff configuration for tests.

- [ ] **Step 1: Create a fake sing-box executable test helper** that records `check` and `run` arguments, opens a controllable process, and can exit on demand.
- [ ] **Step 2: Write failing manager tests** for config file permissions, `check -c`, `run -c`, stop/kill timeout, restart after unexpected exit, missing binary status, and independent failures for two IDs.
- [ ] **Step 3: Implement per-ID serialized lifecycle** with `exec.Command`, config files under `data/singbox/<id>/config.json`, redacted logger output, bounded restart backoff, and cleanup on `Close`.
- [ ] **Step 4: Wire the manager into `cmd/vofly/main.go`** before server construction, pass it through `server.Options`, call `Start` after the database is ready, and close it during graceful shutdown without preventing manual SOCKS5 operation.
- [ ] **Step 5: Run `go test ./internal/singbox ./internal/server -run 'SingBox|Proxy' -v`** and inspect that no test leaves a child process or temp config directory behind.

### Task 4: 白名单可选依赖任务管理器

**Files:**
- Create: `vofly-backend/internal/dependencies/manager.go`
- Create: `vofly-backend/internal/dependencies/manager_test.go`
- Create: `vofly-backend/internal/dependencies/packages.go`

**Interfaces:**
- Adds `dependencies.ComponentID` values `pcsc`, `ffmpeg`, `singbox` and `JobStatus` values `queued`, `running`, `success`, `failed`.
- Adds `Manager.List(ctx) []ComponentStatus`, `Install(ctx, id) (Job, error)`, `Uninstall(ctx, id) (Job, error)`, and `Job(ctx, id) (Job, error)`.
- Package-manager implementations expose only fixed package candidates for apt/dnf/yum/apk/pacman/opkg; sing-box uses a fixed Vofly Release asset URL built from repository, version and detected architecture.

- [ ] **Step 1: Write failing tests** for package-manager detection, package snapshot diff, fixed package candidate selection, rejecting unknown component IDs, job exclusivity, and command argument injection strings.
- [ ] **Step 2: Run `go test ./internal/dependencies -v`** and verify the tests fail before implementation.
- [ ] **Step 3: Implement package-manager commands** with `exec.CommandContext` argument arrays, snapshots before/after install, Vofly-owned package records, and removal limited to packages recorded as newly installed by that component.
- [ ] **Step 4: Implement PC/SC service enable/start and stop/disable** using fixed `systemctl` or `/etc/init.d/pcscd` arguments; implement ffmpeg as package-only.
- [ ] **Step 5: Invoke the official sing-box install script** from the fixed URL with a pinned version argument, execute it through a fixed `sh` command, and keep the runtime path aligned with the official package layout.
- [ ] **Step 6: Add occupied-resource guard** that refuses sing-box uninstall while any parent resource exists or is enabled, and calls `RefreshBinary` after install/uninstall.
- [ ] **Step 7: Run focused dependency tests**, including subprocess helper tests, and verify command output is truncated/redacted before entering the job result.

### Task 5: 后端协议代理与依赖 API

**Files:**
- Modify: `vofly-backend/internal/server/server.go`
- Modify: `vofly-backend/internal/server/proxy_api.go`
- Create: `vofly-backend/internal/server/dependency_api.go`
- Modify: `vofly-backend/internal/server/general_api.go`
- Create: `vofly-backend/internal/server/protocol_proxy_test.go`
- Create: `vofly-backend/internal/server/dependency_api_test.go`

**Interfaces:**
- Routes `GET/POST/PUT/PATCH/DELETE /singbox-proxies`, `/singbox-proxies/:id`, `GET /system/dependencies`, `POST /system/dependencies/:id/install`, `DELETE /system/dependencies/:id`, and `GET /system/dependencies/jobs/:job_id`.
- Protocol create/update requests accept `{id?, name?, uri, enabled?}` and return a redacted parent, child summary, and runtime status.
- Managed upstream mutation returns HTTP 409 with code `managed_proxy_read_only`; dependency collisions return `dependency_busy`; occupied sing-box uninstall returns `dependency_in_use`.

- [ ] **Step 1: Write failing API tests** for protocol create, list, update, enable/disable, delete cascade, managed child PUT/PATCH/DELETE rejection, dependency list, job creation/polling, busy collision, and occupied sing-box uninstall.
- [ ] **Step 2: Run `go test ./internal/server -run 'ProtocolProxy|DependencyAPI' -v`** and verify expected route/method failures.
- [ ] **Step 3: Implement protocol handlers** that parse URI before persistence, allocate a local port safely, create parent/child transactionally, call the manager, and return status/error without exposing config secrets.
- [ ] **Step 4: Update existing upstream handlers** to expose `managedBy`, `managedId`, `readOnly`, and `parentName`, while preserving manual CRUD and binding endpoints.
- [ ] **Step 5: Implement dependency handlers** with authenticated task creation, job polling, stable error codes, and no arbitrary command fields in request structs.
- [ ] **Step 6: Run server API tests and existing proxy tests** together to prove old SOCKS5 behavior remains compatible.

### Task 6: 前端代理页父子资源 UI

**Files:**
- Modify: `vofly-web/src/types.ts`
- Create: `vofly-web/src/components/proxy/SingBoxSection.tsx`
- Create: `vofly-web/src/components/proxy/SingBoxDialog.tsx`
- Modify: `vofly-web/src/components/proxy/UpstreamSection.tsx`
- Modify: `vofly-web/src/pages/ProxyPage.tsx`
- Modify: `vofly-web/src/lib/i18n-en.ts`
- Create: `vofly-web/test/singboxProxy.test.mjs`

**Interfaces:**
- Adds `SingBoxProxy`, `SingBoxStatus`, `DependencyStatus`, and `DependencyJob` DTOs matching the API camelCase conversion.
- `SingBoxSection` accepts parent rows, dependency state, loading flags, and callbacks for create/edit/toggle/delete/install/uninstall.
- `UpstreamSection` receives managed metadata and hides edit/delete for read-only children while preserving binding and status actions.

- [ ] **Step 1: Write failing source-guard tests** for the upper sing-box section, lower SOCKS5 section, URI textarea, generated local address, managed read-only label, and sing-box install/uninstall controls.
- [ ] **Step 2: Run `npm test -- test/singboxProxy.test.mjs`** and verify the guards fail because the new components and strings do not exist.
- [ ] **Step 3: Add types and API calls** through the existing `api<T>` wrapper; implement parent load/refresh and dependency job polling without direct `fetch`.
- [ ] **Step 4: Implement `SingBoxDialog`** with a single URI textarea, name field, enabled toggle, backend error rendering, and edit mode that asks for a replacement URI without displaying the stored secret.
- [ ] **Step 5: Implement `SingBoxSection`** above `UpstreamSection`, showing protocol/target/local SOCKS5/status and dependency install/uninstall controls. Disable save while sing-box is absent and keep parent rows visible when runtime fails.
- [ ] **Step 6: Update `UpstreamSection`** to show generated child metadata and only allow binding/probe actions for managed rows; keep manual create/edit/delete unchanged.
- [ ] **Step 7: Add all English translations and run `npm test -- test/singboxProxy.test.mjs` plus the full frontend test suite.

### Task 7: 设置页可选依赖 UI

**Files:**
- Create: `vofly-web/src/components/settings/OptionalDependenciesCard.tsx`
- Modify: `vofly-web/src/pages/SettingsPage.tsx`
- Modify: `vofly-web/src/types.ts`
- Modify: `vofly-web/src/lib/i18n-en.ts`
- Modify: `vofly-web/test/installerScripts.test.mjs`

**Interfaces:**
- `OptionalDependenciesCard` consumes `DependencyStatus[]`, exposes PC/SC and ffmpeg install/uninstall actions, and polls a returned `DependencyJob` until terminal state.

- [ ] **Step 1: Extend source-guard tests** for the optional component card, confirmation text, and both component action labels.
- [ ] **Step 2: Run the focused frontend tests and verify failure** before adding the card.
- [ ] **Step 3: Implement the card** using existing `CardDecor`, `CardIcon`, `CardTitle`, `Button`, `Tag`, `confirmDialog`, `message`, and `api` patterns; show missing package-manager reasons and never expose command lines.
- [ ] **Step 4: Load dependency state with the existing SettingsPage initial fetch** and refresh after every terminal job; run frontend tests again.

### Task 8: 安装脚本与 Release 资产

**Files:**
- Modify: `vofly-web/install.sh`
- Modify: `vofly-web/update.sh`
- Modify: `vofly-web/uninstall.sh`
- Modify: `vofly-web/.github/workflows/cd.yml`
- Create: `vofly-web/THIRD_PARTY_NOTICES.md`
- Modify: `vofly-web/test/installerScripts.test.mjs`

**Interfaces:**
- Installer CLI no longer recognizes or documents `--with-pcsc` or `--with-ffmpeg`; required runtime package installation remains intact.
- CD publishes `sing-box_<vofly-release>_linux_{amd64,arm64,armv7}` and checksum entries, using a pinned upstream sing-box version.

- [ ] **Step 1: Add failing installer guard assertions** that the optional flags/functions/calls are absent while `install_runtime_dependencies`, service creation, checksum verification, and rollback remain present.
- [ ] **Step 2: Run `npm test -- test/installerScripts.test.mjs`** and verify the new assertions fail against the current scripts.
- [ ] **Step 3: Remove optional flags, help text, `finish_install` branches, PC/SC/ffmpeg package functions, and related automatic service/package calls**; leave necessary dependency tracking and service lifecycle untouched.
- [ ] **Step 4: Keep sing-box out of the Vofly Release assets**; the web-managed dependency task uses the official installer URL at runtime.
- [ ] **Step 5: Document sing-box source/version/license and run installer tests plus shell syntax checks** with `sh -n install.sh update.sh uninstall.sh`.

### Task 9: 集成验证与分别提交

**Files:**
- Modify only files listed in Tasks 1-8.

- [ ] **Step 1: Run backend focused tests**: `go test ./internal/singbox ./internal/dependencies ./internal/store ./internal/server`.
- [ ] **Step 2: Run backend full checks**: `go test ./...`, `go vet ./...`, and `go build ./cmd/vofly`.
- [ ] **Step 3: Run frontend full checks**: `npm test` and `npm run build`.
- [ ] **Step 4: Review `git diff --check` and `git status --short` in both repositories**; ensure no generated `dist`, temporary configs, package snapshots, or unrelated files are staged.
- [ ] **Step 5: Commit backend and frontend separately with Chinese messages** after fresh verification evidence is available.
