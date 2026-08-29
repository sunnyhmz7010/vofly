<div align="center">
  <img src="./public/icon-512.png" alt="vofly Logo" width="120" />
  <h1>vofly</h1>
  <p>面向 4G/LTE/5G 模组的自托管 Web 控制面板与工程工具套件</p>
</div>

<p align="center">
  <a href="https://github.com/sunnyhmz7010/vofly/releases"><img src="https://img.shields.io/github/v/release/sunnyhmz7010/vofly?label=Release&color=3b82f6" alt="Release" /></a>
  <a href="https://github.com/sunnyhmz7010/vofly/blob/main/LICENSE"><img src="https://img.shields.io/github/license/sunnyhmz7010/vofly?color=10b981" alt="License" /></a>
  <a href="https://github.com/sunnyhmz7010/vofly/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/sunnyhmz7010/vofly/ci.yml?branch=main&label=CI" alt="CI" /></a>
</p>

---

## ⚡ 快速开始

### 📋 前置要求

- Linux 主机（x86_64 / arm64 / armv7），具备模组串口或 USB 访问权限
- `curl` 与 `sha256sum`（安装脚本依赖）
- USB SIM 读卡器依赖系统 `pcscd` 服务与 CCID 驱动，可通过安装脚本 `--with-pcsc` 选装

### 📦 安装与运行

#### 🚀 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh
```

安装后默认监听 `0.0.0.0:7575`，数据库位于 `/opt/vofly/data/vofly.db`。首次安装会生成管理员初始密码并仅在终端显示一次；默认用户名为 `admin`，请立即记录密码并在登录后修改。

#### 🔍 仅检查依赖不安装

只检查 Linux、架构、curl、SHA256 工具、systemd、pcscd 状态，不下载、不安装、不写文件：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sh -s -- --check-env
```

#### 📌 安装指定版本

在命令末尾追加版本号即可：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- v1.0.0
```

回退到旧版本同样使用该方式。

#### 🖥️ USB SIM 读卡器（可选）

使用 PC/SC USB SIM 读卡器的用户在安装命令后追加 `--with-pcsc`，脚本会在支持的软件包管理器上自动安装并启动 `pcscd` 与 CCID 驱动（失败仅警告，不阻断安装）：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- --with-pcsc
```

不支持自动安装的系统请手动安装，例如 Debian/Ubuntu：`sudo apt install pcscd libccid`。

#### 🔄 更新

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/update.sh | sudo sh
```

#### 🗑️ 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/uninstall.sh | sudo sh
```

默认卸载保留数据库和环境文件。确认删除全部本机数据（不可恢复，含短信记录等，请先备份）时追加 `--purge`：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/uninstall.sh | sudo sh -s -- --purge
```

#### 💿 手动二进制安装

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
