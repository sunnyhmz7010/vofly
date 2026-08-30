# vofly 安装依赖与卸载清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 vofly 安装脚本自动安装 QMI/网络运行依赖，记录本次新增系统包，并让卸载脚本清理这些包、CLI 链接和安装记录，同时删除废弃的 `--check-env` 选项。

**Architecture:** `install.sh` 按发行版选择包管理器和包名，在每次包安装前后生成已安装包快照，用差异写入 `/etc/vofly/installed-packages`。`uninstall.sh` 读取该记录，仅调用记录对应的包管理器删除包；应用数据默认保留，`--purge` 继续删除应用目录和环境目录。

**Tech Stack:** POSIX `sh`、apt/dnf/yum/apk/pacman/opkg、Node.js `node:test`。

**Spec:** 用户确认的安装器自动安装 QMI 依赖、卸载清理安装内容、移除“仅检查依赖不安装”选项。

## Global Constraints

- 默认安装 Debian/Ubuntu 的 `libqmi-utils`、`iproute2`、`ca-certificates`。
- Fedora/RHEL 使用 `libqmi-utils`、`iproute`、`ca-certificates`；Alpine 使用 `qmi-utils`、`iproute2`、`ca-certificates`；Arch 使用 `libqmi`、`iproute2`、`ca-certificates`。
- 仅记录本次安装前不存在、安装后新增的系统包及其依赖；卸载不得删除安装前已有的包。
- 删除 `--check-env`、`CHECK_ENV`、检查分支和 README 中对应说明。
- 保留前一轮卡策略未提交改动，不修改无关文件。

---

### Task 1: Installer and Uninstaller Contract Tests

**Files:**
- Create: `test/installerScripts.test.mjs`

- [x] **Step 1: Write the failing tests**

  Assert that the installer contains runtime dependency installation and package recording, no longer contains the check-only option, and that the uninstaller removes the CLI link and recorded packages.

- [x] **Step 2: Run the focused test and verify it fails**

  Run: `node --test test/installerScripts.test.mjs`

  Expected: FAIL because the current scripts still expose `CHECK_ENV`/`--check-env`, do not install the default QMI packages, and do not remove the recorded package list or CLI link.

### Task 2: Automatic Runtime Dependency Installation

**Files:**
- Modify: `install.sh`
- Modify: `README.md`

- [x] **Step 1: Implement package-manager detection and snapshots**

  Add a package manager selector for apt, dnf, yum, apk, pacman, and opkg. Snapshot installed package names before and after each installation and append only the sorted difference as `manager|package` to `/etc/vofly/installed-packages`.

- [x] **Step 2: Install required runtime packages before downloading the release**

  Use the distro-specific package sets from the global constraints. Keep `--with-pcsc` and `--with-ffmpeg` as optional feature switches, but route their package installation through the same tracking function.

- [x] **Step 3: Remove check-only parsing, branch, function, help text, and README section**

  The normal install path must always perform dependency installation; `--check-env` becomes an unknown argument.

- [x] **Step 4: Run focused tests and shell syntax checks**

  Run: `node --test test/installerScripts.test.mjs` and `sh -n install.sh`.

  Expected: PASS with no syntax errors.

### Task 3: Complete Uninstall Cleanup

**Files:**
- Modify: `uninstall.sh`

- [x] **Step 1: Remove application artifacts and CLI link**

  Delete `/opt/vofly/bin/vofly`, its backup, and `/usr/local/bin/vofly` when present.

- [x] **Step 2: Remove recorded system packages safely**

  Read `/etc/vofly/installed-packages`, group by supported package manager, remove only those package names, and retain the record when any package removal fails so a later uninstall can retry.

- [x] **Step 3: Remove the installation record**

  Delete the record after successful package cleanup; with `--purge`, also delete `/opt/vofly` and `/etc/vofly` using the existing path guard.

- [x] **Step 4: Run focused tests and shell syntax checks**

  Run: `node --test test/installerScripts.test.mjs test/qrWavTransfer.test.mjs` and `sh -n uninstall.sh`.

  Expected: PASS with no syntax errors.

### Task 4: Regression Verification

**Files:**
- No additional files.

- [ ] **Step 1: Run all available frontend static tests**

  Run: `npm test`.

- [x] **Step 2: Check the final diff**

  Run: `git diff --check` and `git status --short`.

  Expected: only the installer documentation/tests/scripts plus the already-present card policy changes are visible.
