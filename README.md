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

- Linux 主机或 OpenWrt/Kwrt 设备（x86_64 / arm64 / armv7），具备模组串口或 USB 访问权限
- 安装脚本会自动安装 QMI、网络工具和 CA 证书等运行依赖
- VoWiFi IMS 需要内核支持 XFRM/IPsec；OpenWrt/Kwrt 会尝试安装当前软件源中与固件内核匹配的 `ip-full`、`kmod-ipsec`、`kmod-ipsec4/6` 和相关 crypto kmod，禁止强装其他内核版本的 kmod
- USB SIM 读卡器依赖系统 `pcscd` 服务与 CCID 驱动，可通过安装脚本 `--with-pcsc` 选装

### 📦 安装与运行

#### 🚀 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh
```

安装后默认监听 `0.0.0.0:7575`，数据库位于 `/opt/vofly/data/vofly.db`。普通 Linux 写入 `systemd` 服务，OpenWrt/Kwrt 写入 `/etc/init.d/vofly` procd 服务。首次安装会生成初始访问密令并仅在终端显示一次，请立即记录；登录后可在 Web 设置或运行 `vofly menu` 修改。

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

也可稍后手动安装，例如 Debian/Ubuntu：`sudo apt install pcscd libccid`。

#### 🎙️ 通话录音 MP3 转码（可选）

通话录音会混音上行与下行两路音频；装有 `ffmpeg` 时自动转码为 MP3，缺失时保存为 WAV。需要 MP3 时在安装命令后追加 `--with-ffmpeg`，脚本会在支持的软件包管理器上自动安装 ffmpeg（失败仅警告，不阻断安装）：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- --with-ffmpeg
```

也可稍后手动安装，例如 Debian/Ubuntu：`sudo apt install ffmpeg`。

#### 📶 VoWiFi 内核检查

安装脚本默认验证 XFRM/IPsec 是否可用。OpenWrt/Kwrt 会优先从当前软件源安装可用的 `ip-full`、`kmod-ipsec`、`kmod-ipsec4`、`kmod-ipsec6`、`kmod-crypto-authenc`、`kmod-crypto-cbc`、`kmod-crypto-aes`、`kmod-crypto-hmac`、`kmod-crypto-sha1`；如果软件源没有与当前内核匹配的 kmod，需要更换包含这些组件的同版本固件。

仅使用蜂窝短信、数据或基础模组管理、不使用 VoWiFi IMS 时，可跳过检查：

```bash
curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- --skip-vowifi-check
```

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
