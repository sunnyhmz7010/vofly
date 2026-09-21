# sing-box 协议代理接入设计

## 目标

在代理管理页增加由 sing-box 接管的协议代理区域。用户粘贴 VLESS、VMess、Trojan、Shadowsocks 或 SOCKS5 URI 后，后端解析并保存协议配置，启动独立 sing-box 实例，在本机生成带 UDP 的 SOCKS5 监听，并自动把这个监听注册为下方现有 SOCKS5 代理列表中的只读子记录。现有国家规则、SIM/Profile 绑定和 VoWiFi 路由继续绑定下方 SOCKS5 记录。

## 已确认的交互模型

- 页面上方新增“协议代理（sing-box）”区；现有“SOCKS5 代理”区保留在下方。
- 一条协议 URI 对应一个父资源、一个 sing-box 进程和一个本地 SOCKS5 子资源。
- 父资源创建成功后，子资源自动出现在现有 SOCKS5 区，地址为 `127.0.0.1:<持久化端口>`，并显示“由 sing-box 接管”。
- 子资源只读。不能通过现有 SOCKS5 编辑或删除入口修改其地址、账号或密码。
- 父资源的启用、禁用、编辑、删除操作同步控制 sing-box 进程及子资源状态。
- 删除父资源时删除子资源；子资源上的国家规则和 Profile 绑定按现有外键级联规则清理，线路回退直连。
- 手工创建的 SOCKS5 记录保持现有行为，与 sing-box 父资源完全分离。

## 首期协议范围

首期支持以下 URI scheme：

- `vless://`
- `vmess://`
- `trojan://`
- `ss://`
- `socks5://`、`socks://`

协议配置覆盖常见的 TCP、WebSocket、gRPC、TLS、Reality、认证和 Shadowsocks 加密参数。订阅 URL、整份 sing-box JSON、Hysteria2、TUIC 以及其他协议不在首期范围内；后端必须返回可定位的“不支持协议/参数”错误，不能把未知 URI 当作 SOCKS5 保存。

## 系统架构

### 后端数据模型

新增 `singbox_proxies` 表保存父资源：

- `id`：安全对象 ID。
- `name`：显示名称。
- `protocol`：规范化协议名。
- `config_json`：解析后的 sing-box outbound 配置，包含运行所需的敏感字段，仅允许后端内部读取。
- `local_port`：持久化的本地 SOCKS5 端口。
- `upstream_proxy_id`：指向现有 `upstream_proxies.id` 的唯一外键。
- `enabled`、`created_at`、`updated_at`。

扩展现有 `upstream_proxies` 表，增加：

- `managed_by`：空字符串表示手工 SOCKS5，`singbox` 表示派生记录。
- `managed_id`：对应 `singbox_proxies.id`。

现有 `UpstreamProxy` API 继续返回手工与派生记录；派生记录额外返回管理来源、父 ID 和只读标记，但不返回协议秘密。父资源 API 返回协议、服务器展示信息、本地 SOCKS5 子记录摘要及运行状态，不返回原始 URI、UUID、密码、Reality 公钥以外的敏感配置或完整 outbound JSON。

数据库迁移必须保持已有数据不变，已有手工 SOCKS5 行的 `managed_by` 和 `managed_id` 为空。

### URI 解析与配置生成

新增纯 Go 解析模块，输入为单条 URI，输出规范化的协议名、展示元数据和 sing-box outbound JSON。解析规则：

- 使用 `net/url`、base64 解码和结构化 JSON 解析，禁止通过脆弱的字符串切割解析密码、IPv6 或查询参数。
- 主机、端口、用户标识、密码、UUID、TLS/Reality、传输路径、gRPC service name 等字段严格校验。
- 拒绝控制字符、空主机、非法端口、过长字段、未知必需参数和不支持的传输方式。
- VMess 支持标准 base64 JSON URI；SS 支持 SIP002 与常见 `method:password@host:port` 变体；其他协议遵循对应 RFC/v2ray URI 约定。
- 配置生成结果只允许包含一个目标 outbound；本地 SOCKS5 inbound 固定由运行时管理器补充。

### sing-box 运行时

新增 `internal/singbox` 包，封装外部 sing-box 进程，不把进程管理散落在 HTTP handler：

- 每个父资源使用独立目录 `data/singbox/<id>/`，配置文件权限为 `0600`，目录权限为 `0700`。
- 配置固定生成一个 `socks` inbound：监听 `127.0.0.1`、持久化 `local_port`、启用 UDP、无认证；outbound 使用解析结果。
- 启动前执行 `sing-box check -c <config>`；检查失败时不启动并记录错误。
- 使用 `exec.Command` 启动 `sing-box run -c <config>`，捕获 stdout/stderr 到结构化日志，不把 URI 或密码写入日志。
- 管理器在服务启动时加载所有启用的父资源；创建、更新、启用、禁用和删除时按 ID 串行重载。
- 进程异常退出时按退避策略自动重启；连续失败时保留错误状态并继续服务其他实例。
- 服务关闭时停止并等待所有子进程，超时后 kill，不能遗留 sing-box 进程。
- sing-box 缺失、配置校验失败、端口占用或进程退出都要通过父资源状态 API 返回；这些错误不能破坏已有手工 SOCKS5。

### API

新增路由：

- `GET /singbox-proxies`：父资源列表和运行状态。
- `POST /singbox-proxies`：接受 `{id?, name?, uri, enabled?}`，解析、分配端口、创建父子记录并启动运行时。
- `PUT /singbox-proxies/:id`：接受新的 URI/名称，先校验和生成配置，再原子替换父配置并重启对应实例。
- `PATCH /singbox-proxies/:id`：切换启用状态，同时更新子 SOCKS5 的 `enabled`。
- `DELETE /singbox-proxies/:id`：停止实例并删除父子记录。

现有 `/upstream-proxies` 行为调整：

- `GET` 增加 `managedBy`、`managedId`、`readOnly`、`parentName` 等展示字段。
- 对 `managedBy=singbox` 的记录拒绝 `PUT/PATCH/DELETE`，返回稳定错误码 `managed_proxy_read_only`。
- 手工记录的创建、编辑、删除、探测保持兼容。
- 现有 Profile/国家规则接口继续接收子 SOCKS5 的 ID，不引入第二套绑定 ID。

### 前端

新增 `SingBoxSection`、`SingBoxDialog` 和必要的纯类型/展示逻辑。`ProxyPage` 同时加载父资源和现有 SOCKS5 列表，父资源操作成功后刷新两者。

- 顶部按钮打开协议 URI 输入对话框；提交前只做空值和单 URI 基础检查，权威解析由后端完成。
- 列表展示名称、协议、目标服务器、本地 SOCKS5 地址、运行状态和错误摘要。
- 错误文案使用后端 `ApiError.code` 映射，未知错误回退 `apiMessage`。
- 下方 SOCKS5 表对派生行显示 sing-box 标记，隐藏编辑/删除按钮，仅保留绑定、状态和连通性结果。
- 所有新增中文文案同步加入 `src/lib/i18n-en.ts`。

### 发布与安装

前端仓库的 Release workflow 下载固定版本的 sing-box 官方 Linux `amd64`、`arm64`、`armv7` 压缩包，解包后以 `sing-box_<vofly-release>_linux_<arch>` 作为 Release asset，并加入同一份 `SHA256SUMS`。固定版本在 workflow 环境变量中声明，升级时显式变更。

安装脚本不自动安装 sing-box；Release workflow 仍生成经校验的 sing-box asset，供网页端按需安装。`install.sh`、`update.sh` 和 `uninstall.sh` 不再处理 sing-box、PC/SC 或 ffmpeg 这些可选组件，但主体服务二进制、必要运行依赖、服务重启、校验和回滚流程保持不变。后端通过 `VOFLY_SING_BOX_PATH` 支持测试和自定义路径，默认使用 `/opt/vofly/bin/sing-box`，开发环境可使用 PATH 中的 `sing-box`。

Release 文档需要注明 sing-box 版本、上游仓库和许可证信息，避免把第三方二进制来源隐藏在安装脚本中。

## 可选依赖网页管理

新增后端白名单依赖管理器，前端不能提交任意命令、包名或下载 URL。统一资源标识为 `pcsc`、`ffmpeg`、`singbox`：

- `GET /system/dependencies` 返回当前包管理器、组件安装状态、版本/路径、可安装性、可卸载性和占用原因。
- `POST /system/dependencies/:id/install` 创建安装任务，返回任务 ID；`DELETE /system/dependencies/:id` 创建卸载任务。任务状态通过 `GET /system/dependencies/jobs/:job_id` 查询。
- 安装/卸载任务单例执行；同一组件已有任务时返回稳定错误码 `dependency_busy`。
- `pcsc`、`ffmpeg` 只使用后端为当前包管理器预定义的候选包集合。安装前记录已安装包快照，只把本次新增的包写入 Vofly 自己的依赖记录；卸载时只删除这些记录，绝不删除用户原先拥有的包。
- 安装 PC/SC 后按当前系统启用并启动 `pcscd.socket` 或等效服务；卸载前停止并禁用该服务。ffmpeg 无服务动作。
- `singbox` 安装时根据当前架构、Vofly Release 版本和固定 asset 名称从 Vofly Release 下载，使用 Release 的 `SHA256SUMS` 校验后原子替换 `/opt/vofly/bin/sing-box`；下载失败不得破坏现有文件。卸载前必须确认没有启用或存在的 sing-box 父资源，否则返回 `dependency_in_use`。
- sing-box 安装/卸载任务完成后通知运行时管理器重新检测二进制；安装后启用的父资源自动尝试恢复，卸载后父资源保留但进入“运行时未安装”错误状态。
- 包管理器命令只能通过 `exec.CommandContext` 参数数组执行，允许的可执行文件、参数和包名全部由后端代码固定；输出只保留脱敏后的尾部诊断信息。

前端在系统设置新增“可选组件”卡片，只显示 PC/SC 与 ffmpeg 的状态、安装和卸载按钮；卸载操作显示确认对话框。代理页 sing-box 区显示 sing-box 状态和安装/卸载入口，未安装时允许打开协议配置但保存操作给出明确提示。所有操作显示任务进度、成功结果或后端错误码映射。

## 错误与安全边界

- 原始 URI 不进入 API 响应、普通日志、审计详情或错误消息；敏感字段只存在于受限配置文件和 SQLite 中。
- API 请求体沿用现有大小限制；单个 URI、字段长度和配置 JSON 都有明确上限。
- 监听只绑定 `127.0.0.1`，不允许通过协议 URI 改为公网地址。
- sing-box 子进程使用固定可执行文件路径和参数，不把用户输入拼接进 shell；所有进程调用使用 `exec.Command` 参数数组。
- 任一 sing-box 实例失败只影响它自己的子 SOCKS5 状态；手工 SOCKS5、其他实例和 Web API 继续可用。
- 更新、删除和关闭流程必须清理进程；测试验证不存在孤儿进程和残留临时配置。
- 安装脚本参数帮助中不得再出现 `--with-pcsc` 或 `--with-ffmpeg`，脚本不能主动调用这些可选依赖的安装流程；必要运行依赖仍按原有逻辑安装。

## 测试验收

后端：

- URI 解析测试覆盖每个首期 scheme、IPv6、base64 变体、TLS/Reality/WS/gRPC 字段和非法输入。
- 配置生成测试断言本地 SOCKS5 inbound 的地址、端口、UDP 和 outbound 映射，且秘密不会出现在展示响应。
- Store 测试覆盖迁移、父子创建、级联删除、手工记录兼容和只读字段。
- 运行时测试使用假的 sing-box 可执行文件验证 check、启动、停止、异常退出重启、端口冲突和关闭清理。
- 依赖管理测试覆盖包管理器白名单、安装前后快照、只卸载 Vofly 新增包、PC/SC 服务动作、sing-box Release 校验、任务互斥、依赖占用拒绝和命令参数注入防护。
- API 测试覆盖创建/更新/启停/删除、运行时错误返回、派生 SOCKS5 只读和现有绑定接口兼容。

前端：

- 源码守卫测试锁定上方协议区、下方 SOCKS5 区、派生行只读标记和关键中英文文案。
- 纯逻辑测试覆盖父子记录展示和错误码映射。
- 设置页测试锁定 PC/SC 与 ffmpeg 的安装/卸载入口，代理页测试锁定 sing-box 依赖状态和入口。
- 安装器源码守卫必须确认可选依赖参数和自动安装调用已移除，同时必要运行依赖安装仍存在。
- 必须通过 `npm test` 和 `npm run build`。

跨仓库最低验证：

```text
vofly-web:     npm test && npm run build
vofly-backend: go test ./... && go vet ./... && go build ./cmd/vofly
```
