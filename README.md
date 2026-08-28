<div align="center">
  <img src="./public/icon-512.png" alt="vofly Logo" width="120" />
  <h1>vofly</h1>
  <p>面向蜂窝模组的自托管 Web 控制面板与工程工具套件</p>
</div>

<p align="center">
  <a href="https://github.com/sunnyhmz7010/vofly/releases"><img src="https://img.shields.io/github/v/release/sunnyhmz7010/vofly?label=Release&color=3b82f6" alt="Release" /></a>
  <a href="https://github.com/sunnyhmz7010/vofly/blob/main/LICENSE"><img src="https://img.shields.io/github/license/sunnyhmz7010/vofly?color=10b981" alt="License" /></a>
  <a href="https://github.com/sunnyhmz7010/vofly/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/sunnyhmz7010/vofly/ci.yml?branch=main&label=CI" alt="CI" /></a>
</p>

---

## ✨ 为什么做这个项目

蜂窝模组调试经常分散在 AT 终端、短信工具、eSIM 工具、网络诊断脚本和通知机器人之间。vofly 将这些能力收敛到一个自托管 Web 控制台，方便在本地网络内统一管理 Quectel 等高通系模组。

本仓库是公开前端与发布入口；后端 Go 源码位于独立仓库 `vofly-backend`。发布流水线会在创建 GitHub Release 时构建前端产物，再拉取后端源码并嵌入前端，生成单文件 Linux 二进制。

## 🚀 核心能力

- 模组总览：设备发现、在线状态、信号、运营商、SIM/eSIM 信息。
- 短信：收发短信、会话列表、已读状态、发送速率限制展示。
- 通话：独立 `/phone` 页面、拨号、通话记录、录音播放。
- eSIM：eUICC 信息、Profile 下载、启用、禁用、切换、删除。
- VoWiFi：IMS 状态、WiFi Calling 控制、诊断与恢复入口。
- 余额查询：运营商查询规则、手动查询、历史记录。
- 命令中心：Web slash command 控制台与命令执行时间线。
- 通知机器人：Telegram、QQ、微信、企业微信等交互式通知设置页。
- 运维界面：日志、更新检查、HTTPS、插件、代理和访问设置。

## ⚡ 快速开始

### 📋 前置要求

- 生产安装：Linux amd64 / arm64 / armv7，systemd 推荐，需 `curl` 与 SHA256 校验工具。
- USB SIM 读卡器：需要系统 `pcscd` 服务与 CCID 驱动，可通过安装脚本 `--with-pcsc` 选装。
- 前端开发：Node.js >= 20、npm、可访问后端服务的本地环境。

### 📦 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh
```

安装后默认监听 `0.0.0.0:7575`，数据库位于 `/opt/vofly/data/vofly.db`。首次安装会生成管理员初始密码并仅在终端显示一次；默认用户名为 `admin`，请立即记录密码并在登录后修改。

只检查运行环境、不下载也不写入文件：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sh -s -- --check-env
```

安装指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- v0.1.0
```

需要 USB SIM 读卡器支持时：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- --with-pcsc
```

升级与卸载：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/update.sh | sudo sh
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/uninstall.sh | sudo sh
```

默认卸载保留数据库和环境文件；确认删除全部本机数据时追加 `--purge`。

### 📦 前端本地运行

```bash
git clone https://github.com/sunnyhmz7010/vofly.git
cd vofly
npm ci
npm run dev
```

默认开发服务器监听 `127.0.0.1:5173`，并将 `/api` 代理到 `http://127.0.0.1:7575`。

### 📦 生产构建

```bash
npm ci
npm test
npm run build
```

生产构建产物位于 `dist/`。完整二进制发布由 GitHub Release 触发的 CD 流水线完成。

## 📖 使用说明

本地开发时先启动后端服务，再启动 Vite 前端。登录后通过左侧导航进入设备、短信、通话、命令、设置等页面。

正式发布时，在本仓库创建 GitHub Release；CD 流水线会：

1. 构建当前前端 `dist/`。
2. 使用 `BACKEND_REPO_TOKEN` 拉取 `sunnyhmz7010/vofly-backend`。
3. 将前端产物同步到后端嵌入目录。
4. 交叉编译 Linux amd64 / arm64 / armv7 二进制。
5. 上传二进制与 SHA256 校验文件到该 Release。

## 🧠 功能细节

- 前端使用 React + TypeScript + Vite，页面和组件遵循统一的 vofly 设计令牌。
- 后端 API 默认由 `http://127.0.0.1:7575` 提供；开发代理在 `vite.config.ts` 中配置。
- 品牌图标统一使用 `public/icon-192.png` 与 `public/icon-512.png`，favicon 和触摸图标均来自同一套 PNG 资产。
- 安装脚本使用 `/etc/vofly/env` 写入 `VOFLY_ADDR` 与 `VOFLY_DATABASE_PATH`，systemd 入口为 `/opt/vofly/bin/vofly serve`，同时维护 `/usr/local/bin/vofly` CLI 链接。
- 管理员账号只保存在 SQLite 数据库中；安装脚本首次安装时调用 `vofly bootstrap-admin` 生成随机密码，不会把密码写入环境文件或仓库。
- 通话录音保存为 WAV，可在网页直接播放，也可通过二维码发送到手机；不需要额外音频转码运行库。
- 本仓库不保存后端源码；任何后端实现、数据库迁移、设备控制逻辑都应在 `vofly-backend` 中维护。

## 🧱 技术栈

- 前端：React 19 + TypeScript + Vite
- 样式：Tailwind CSS + vofly 设计令牌
- 图表：ECharts
- 图标：Fluent UI React Icons
- 测试：Node.js test runner
- 目标平台：现代浏览器；发布产物嵌入 Go 后端二进制

## 🗂️ 项目结构

```text
vofly/
├── public/                 # PNG 图标、设备图片、国旗等静态资源
├── src/
│   ├── components/         # 通用组件与业务组件
│   ├── pages/              # 页面级入口
│   ├── lib/                # i18n、工具函数、协议库
│   ├── store/              # React 状态上下文
│   └── api.ts              # 后端 API 调用层
├── test/                   # 前端单元测试与源码守卫
├── .github/                # Issue 模板、CI 与 CD 流水线
├── install.sh              # Linux 一键安装脚本
├── update.sh               # Release 二进制升级脚本
├── uninstall.sh            # 服务与程序卸载脚本
├── index.html              # Vite HTML 入口
├── package.json            # npm 脚本与依赖
└── vite.config.ts          # Vite 构建与开发代理配置
```

## 👨‍💻 本地开发

### 🧰 环境

- Node.js >= 20
- npm

### ⚙️ 命令

```bash
npm ci
npm test
npm run build
npm run dev
```

## 🔐 安全报告

如果发现安全问题，请不要公开披露细节。请优先参考仓库中的 [SECURITY.md](./SECURITY.md) 提交安全报告。

## 📄 许可证

本项目基于 [GPL-3.0](./LICENSE) 开源。

<div align="center">
  <sub>Built with ❤️ by Sunny</sub>
</div>
