#!/bin/sh
# vofly 一键安装脚本。
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh
#   sudo sh install.sh [--force] [--check-env] [--with-pcsc] [版本]

set -eu

REPO="sunnyhmz7010/vofly"
RELEASES_API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASES_LATEST_URL="https://github.com/${REPO}/releases/latest"
RELEASES_DOWNLOAD_URL="https://github.com/${REPO}/releases/download"
SOURCE_BASE_URL="https://raw.githubusercontent.com/${REPO}/main"
USER_AGENT="vofly-installer/1.0 (+https://github.com/${REPO})"

INSTALL_ROOT="/opt/vofly"
BIN_DIR="/opt/vofly/bin"
DATA_DIR="/opt/vofly/data"
BINARY_PATH="/opt/vofly/bin/vofly"
BACKUP_PATH="/opt/vofly/bin/vofly.bak"
LINK_PATH="/usr/local/bin/vofly"
ENV_DIR="/etc/vofly"
ENV_FILE="/etc/vofly/env"
SYSTEMD_UNIT="/etc/systemd/system/vofly.service"
DEFAULT_ADDR="0.0.0.0:7575"
DEFAULT_DATABASE="/opt/vofly/data/vofly.db"

FORCE=0
CHECK_ENV=0
WITH_PCSC=0
VERSION_ARG=""
FIRST_INSTALL=0
INITIAL_ADMIN_PASSWORD=""
ADMIN_NOTICE_PRINTED=0
DOWNLOAD_DIR=""

print_usage() {
  cat <<'USAGE'
用法:
  sudo sh install.sh [--force] [--check-env] [--with-pcsc] [版本]

选项:
  --force           即使当前已是目标版本，也重新下载并安装
  --check-env       只检查运行环境，不下载、不安装、不写入任何文件
  --with-pcsc       安装并启用 pcscd 与 CCID 驱动（USB SIM 读卡器）
  -h|--help         显示帮助

示例:
  curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh
  curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- --with-pcsc
  curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/install.sh | sudo sh -s -- v0.1.0
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --check-env) CHECK_ENV=1 ;;
    --with-pcsc) WITH_PCSC=1 ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --*)
      printf '未知参数：%s\n\n' "$1" >&2
      print_usage
      exit 1
      ;;
    *)
      if [ -n "$VERSION_ARG" ]; then
        printf '只能指定一个版本：%s / %s\n' "$VERSION_ARG" "$1" >&2
        exit 1
      fi
      VERSION_ARG=$1
      ;;
  esac
  shift
done

if ! command -v install >/dev/null 2>&1; then
  install() {
    if [ "${1:-}" = "-d" ]; then
      shift
      mode="0755"
      if [ "${1:-}" = "-m" ]; then
        mode=$2
        shift 2
      fi
      mkdir -p "$@"
      chmod "$mode" "$@"
      return
    fi
    mode="0755"
    if [ "${1:-}" = "-m" ]; then
      mode=$2
      shift 2
    fi
    [ "$#" -eq 2 ] || return 2
    cp "$1" "$2"
    chmod "$mode" "$2"
  }
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '缺少 %s。\n' "$1" >&2
    exit 1
  }
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    printf '需要 root 权限，请使用 sudo 运行。\n' >&2
    exit 1
  fi
}

run_root() {
  "$@"
}

detect_os() {
  if [ "$(uname -s)" != "Linux" ]; then
    printf '本脚本只支持 Linux，当前系统：%s\n' "$(uname -s)" >&2
    exit 1
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    armv7l|armv7|armhf) printf 'armv7\n' ;;
    *)
      printf '无法识别的 CPU 架构：%s（支持 amd64 / arm64 / armv7）\n' "$(uname -m)" >&2
      exit 1
      ;;
  esac
}

curl_github() {
  attempt=0
  while :; do
    if curl -fL --retry 2 --retry-delay 1 -A "$USER_AGENT" "$@"; then
      return 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 3 ]; then
      return 1
    fi
    printf '下载中断，第 %s 次重试…\n' "$attempt"
    sleep 2
  done
}

normalize_version() {
  case "${1:-latest}" in
    ""|latest) printf 'latest\n' ;;
    v*) printf '%s\n' "$1" ;;
    *) printf 'v%s\n' "$1" ;;
  esac
}

version_without_v() {
  printf '%s\n' "$1" | sed 's/^v//'
}

extract_tag_name() {
  printf '%s\n' "$1" | sed -n 's#.*/releases/tag/\([^/?#]*\).*#\1#p' | head -n 1
}

resolve_latest_version() {
  latest=$( { curl_github -sS "$RELEASES_API_URL" || true; } | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
    return
  fi
  latest=$(extract_tag_name "$(curl_github -sS -o /dev/null -w '%{url_effective}' "$RELEASES_LATEST_URL" || true)")
  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
    return
  fi
  printf '无法读取最新 Release，可在命令末尾追加版本号，例如：sudo sh install.sh v0.1.0\n' >&2
  exit 1
}

resolve_version() {
  requested=$(normalize_version "${VERSION_ARG:-latest}")
  if [ "$requested" = "latest" ]; then
    resolve_latest_version
  else
    printf '%s\n' "$requested"
  fi
}

installed_version() {
  if [ ! -x "$BINARY_PATH" ]; then
    return 1
  fi
  "$BINARY_PATH" version 2>/dev/null | awk '{print $2}' | sed -E 's/[[:space:]]*\(.*$//' | head -n 1
}

is_target_installed() {
  current=$(installed_version || true)
  if [ -z "$current" ]; then
    return 1
  fi
  [ "$(version_without_v "$current")" = "$(version_without_v "$VERSION")" ]
}

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi
  printf '缺少 sha256sum 或 shasum，无法校验二进制。\n' >&2
  exit 1
}

checksum_for_asset() {
  awk -v name="$2" '
    NF >= 2 {
      item = $NF
      sub(/^.*\//, "", item)
      if (item == name || item == "*" name) {
        print $1
        exit
      }
    }
  ' "$1"
}

download_file() {
  source_url=$1
  target_file=$2
  mode=$3
  tmp=$(mktemp "${target_file}.tmp.XXXXXX")
  if ! curl_github "$source_url" -o "$tmp"; then
    rm -f "$tmp"
    printf '下载失败：%s\n' "$source_url" >&2
    exit 1
  fi
  chmod "$mode" "$tmp"
  mv "$tmp" "$target_file"
}

try_download_file() {
  source_url=$1
  target_file=$2
  mode=$3
  tmp=$(mktemp "${target_file}.tmp.XXXXXX")
  if curl_github "$source_url" -o "$tmp"; then
    chmod "$mode" "$tmp"
    mv "$tmp" "$target_file"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

verify_checksum() {
  sums_file=$1
  sidecar_file=$2
  asset_name=$3
  binary_file=$4
  actual=$(file_sha256 "$binary_file")
  expected=""
  source_name=""

  if [ -f "$sidecar_file" ]; then
    expected=$(checksum_for_asset "$sidecar_file" "$asset_name")
    source_name="${asset_name}.sha256"
  fi
  if [ -z "$expected" ] && [ -f "$sums_file" ]; then
    expected=$(checksum_for_asset "$sums_file" "$asset_name")
    source_name="SHA256SUMS"
  fi
  if [ -z "$expected" ]; then
    printf '找不到 %s 的 SHA256 校验记录。\n' "$asset_name" >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    printf '校验失败：%s\n来源 %s\n期望 %s\n实际 %s\n' "$asset_name" "$source_name" "$expected" "$actual" >&2
    exit 1
  fi
  printf '校验通过：%s（%s）\n' "$asset_name" "$source_name"
}

ensure_install_dirs() {
  run_root install -d -m 755 "$BIN_DIR" "$DATA_DIR" "$ENV_DIR"
}

ensure_cli_link() {
  run_root install -d -m 755 "$(dirname "$LINK_PATH")"
  run_root ln -sfn "$BINARY_PATH" "$LINK_PATH"
}

write_default_env() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/vofly-env.XXXXXX")
  if [ -f "$ENV_FILE" ]; then
    grep -Ev '^VOFLY_ADMIN_(USERNAME|PASSWORD|PASSWORD_B64)=' "$ENV_FILE" >"$tmp" || true
  else
    : >"$tmp"
  fi
  if ! grep -q '^VOFLY_ADDR=' "$tmp"; then
    printf 'VOFLY_ADDR=%s\n' "$DEFAULT_ADDR" >>"$tmp"
  fi
  if ! grep -q '^VOFLY_DATABASE_PATH=' "$tmp"; then
    printf 'VOFLY_DATABASE_PATH=%s\n' "$DEFAULT_DATABASE" >>"$tmp"
  fi
  run_root install -m 600 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  printf '已写入环境文件：%s\n' "$ENV_FILE"
}

generate_admin_password() {
  secret=""
  if command -v od >/dev/null 2>&1; then
    secret=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  elif command -v hexdump >/dev/null 2>&1; then
    secret=$(hexdump -n 16 -e '16/1 "%02x"' /dev/urandom 2>/dev/null || true)
  elif command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -hex 16 2>/dev/null || true)
  elif command -v sha256sum >/dev/null 2>&1; then
    secret=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | sha256sum | awk '{print substr($1, 1, 32)}')
  else
    secret=$(tr -dc 'a-f0-9' </dev/urandom | head -c 32)
  fi
  if [ -z "$secret" ]; then
    printf '生成随机管理员密码失败。\n' >&2
    exit 1
  fi
  printf '%s\n' "$secret"
}

bootstrap_admin() {
  candidate=$1
  secret=$(generate_admin_password)
  result=$(printf '%s\n' "$secret" | "$candidate" bootstrap-admin --database "$DEFAULT_DATABASE" --username admin 2>/dev/null) || {
    printf '待安装版本无法读取或初始化数据库；当前程序尚未被替换，请检查数据库与版本兼容性。\n' >&2
    exit 1
  }
  case "$result" in
    created)
      FIRST_INSTALL=1
      INITIAL_ADMIN_PASSWORD=$secret
      ;;
    exists)
      ;;
    *)
      printf '管理员初始化返回未知结果：%s\n' "$result" >&2
      exit 1
      ;;
  esac
}

print_admin_credentials() {
  if [ "$FIRST_INSTALL" != "1" ] || [ "$ADMIN_NOTICE_PRINTED" = "1" ]; then
    return
  fi
  ADMIN_NOTICE_PRINTED=1
  printf '\n================ 安装完成 ================\n'
  printf '首次安装已生成管理员初始密码（仅显示一次）：\n\n'
  printf '    %s\n\n' "$INITIAL_ADMIN_PASSWORD"
  printf '用户名：admin\n'
  printf '请立即记录此密码；登录后可在 Web 设置或运行 vofly menu 修改。\n'
  printf '==========================================\n'
}

write_systemd_unit() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/vofly-service.XXXXXX")
  cat >"$tmp" <<'EOF'
[Unit]
Description=vofly modem management service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/vofly
EnvironmentFile=/etc/vofly/env
ExecStart=/opt/vofly/bin/vofly serve
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30s
TimeoutStopSec=40s
RuntimeDirectory=vofly
RuntimeDirectoryMode=0755

AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=false
ProtectSystem=strict
ProtectHome=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectControlGroups=true
ReadWritePaths=/opt/vofly/data /opt/vofly/bin
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK AF_PACKET
RestrictRealtime=true
LockPersonality=true
MemoryDenyWriteExecute=true
UMask=0077
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
  run_root install -m 644 "$tmp" "$SYSTEMD_UNIT"
  rm -f "$tmp"
  printf '已写入 systemd 服务：%s\n' "$SYSTEMD_UNIT"
}

env_port() {
  address=$(sed -n 's/^VOFLY_ADDR=//p' "$ENV_FILE" 2>/dev/null | tail -n 1)
  if [ -z "$address" ]; then
    address=$DEFAULT_ADDR
  fi
  printf '%s\n' "$address" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p'
}

wait_for_service() {
  port=$(env_port)
  if [ -z "$port" ]; then
    return 0
  fi
  attempts=0
  while [ "$attempts" -lt 20 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:${port}/healthz" 2>/dev/null; then
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done
  return 1
}

restart_service() {
  if ! command -v systemctl >/dev/null 2>&1; then
    printf '未检测到 systemd。可手动运行：%s serve\n' "$BINARY_PATH"
    return 0
  fi
  if ! run_root systemctl daemon-reload; then
    return 1
  fi
  run_root systemctl enable vofly.service >/dev/null 2>&1 || true
  if ! run_root systemctl restart vofly.service; then
    return 1
  fi
  if wait_for_service; then
    printf '服务已启动：vofly.service\n'
  else
    printf '服务已提交启动；首次初始化可能需要更久，可用 systemctl status vofly.service 查看状态。\n'
  fi
}

rollback_binary() {
  if [ -f "$BACKUP_PATH" ]; then
    printf '启动失败，回滚到上一版本。\n' >&2
    run_root install -m 755 "$BACKUP_PATH" "$BINARY_PATH"
    restart_service || true
  fi
}

install_packages() {
  installer=$1
  shift
  failed=0
  for package in "$@"; do
    if ! $installer "$package"; then
      printf '未安装：%s\n' "$package" >&2
      failed=1
    fi
  done
  return "$failed"
}

opkg_has_package() {
  opkg list 2>/dev/null | cut -d' ' -f1 | grep -qx "$1"
}

install_pcsc_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update -y
    install_packages "run_root apt-get install -y" pcscd libccid
    return $?
  fi
  if command -v dnf >/dev/null 2>&1; then
    install_packages "run_root dnf install -y" pcsc-lite ccid
    return $?
  fi
  if command -v yum >/dev/null 2>&1; then
    install_packages "run_root yum install -y" pcsc-lite ccid
    return $?
  fi
  if command -v apk >/dev/null 2>&1; then
    install_packages "run_root apk add --no-cache" pcsc-lite ccid
    return $?
  fi
  if command -v pacman >/dev/null 2>&1; then
    install_packages "run_root pacman -Sy --noconfirm" pcsclite ccid
    return $?
  fi
  if command -v opkg >/dev/null 2>&1; then
    packages=""
    opkg_has_package pcscd && packages="$packages pcscd"
    opkg_has_package libccid && packages="$packages libccid"
    opkg_has_package ccid && packages="$packages ccid"
    if [ -z "$packages" ]; then
      printf '当前 OpenWrt 软件源未提供 pcscd/libccid/ccid。\n' >&2
      return 1
    fi
    run_root opkg update
    install_packages "run_root opkg install" $packages
    return $?
  fi
  printf '未识别包管理器，请手动安装 pcscd 与 CCID 驱动。\n' >&2
  return 1
}

start_pcsc_service() {
  if command -v systemctl >/dev/null 2>&1; then
    run_root systemctl enable --now pcscd.socket >/dev/null 2>&1 && return 0
    run_root systemctl restart pcscd >/dev/null 2>&1 && return 0
  fi
  if [ -x /etc/init.d/pcscd ]; then
    run_root /etc/init.d/pcscd enable >/dev/null 2>&1 || true
    run_root /etc/init.d/pcscd restart >/dev/null 2>&1 || run_root /etc/init.d/pcscd start >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

install_pcsc_support() {
  printf '安装 USB SIM 读卡器依赖：pcscd 与 CCID 驱动。\n'
  if ! install_pcsc_packages; then
    printf 'pcscd/CCID 自动安装失败；不影响普通蜂窝模组。\n' >&2
    return 1
  fi
  if ! start_pcsc_service; then
    printf 'pcscd 已安装但未能自动启动，请手动启用服务。\n' >&2
    return 1
  fi
  printf 'USB SIM 读卡器依赖已就绪。\n'
}

run_check_env() {
  printf 'vofly 运行环境检查（只读）\n\n'
  failed=0
  if [ "$(uname -s)" = "Linux" ]; then
    printf '[通过] 操作系统：Linux\n'
  else
    printf '[失败] 操作系统不是 Linux。\n'
    failed=1
  fi
  if detect_arch >/dev/null 2>&1; then
    printf '[通过] CPU 架构：%s\n' "$(detect_arch)"
  else
    failed=1
  fi
  if command -v curl >/dev/null 2>&1; then
    printf '[通过] curl：%s\n' "$(command -v curl)"
  else
    printf '[失败] 缺少 curl。\n'
    failed=1
  fi
  if command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1; then
    printf '[通过] SHA256 校验工具已可用。\n'
  else
    printf '[失败] 缺少 sha256sum 或 shasum。\n'
    failed=1
  fi
  if command -v systemctl >/dev/null 2>&1; then
    printf '[通过] systemd：已检测到。\n'
  else
    printf '[提示] 未检测到 systemd；仍可手动前台运行。\n'
  fi
  if command -v pcscd >/dev/null 2>&1; then
    printf '[通过] pcscd：已安装。\n'
  else
    printf '[提示] USB SIM 读卡器需要 pcscd/CCID；安装时可追加 --with-pcsc。\n'
  fi
  return "$failed"
}

cleanup_downloads() {
  if [ -n "$DOWNLOAD_DIR" ] && [ -d "$DOWNLOAD_DIR" ]; then
    rm -rf "$DOWNLOAD_DIR"
  fi
}

on_exit() {
  status=$?
  cleanup_downloads
  if [ "$status" -ne 0 ]; then
    print_admin_credentials
  fi
}

finish_install() {
  if [ "$WITH_PCSC" = "1" ]; then
    install_pcsc_support || true
  else
    printf '如需 USB SIM 读卡器支持，可重新运行安装命令并追加 --with-pcsc。\n'
  fi
  if ! restart_service; then
    rollback_binary
    exit 1
  fi
  print_admin_credentials
  PORT=$(env_port)
  printf '\n访问地址：http://YOUR_IP:%s\n' "${PORT:-7575}"
  printf 'CLI：%s\n' "$LINK_PATH"
  printf '升级：curl -fsSL %s/update.sh | sudo sh\n' "$SOURCE_BASE_URL"
  printf '卸载：curl -fsSL %s/uninstall.sh | sudo sh\n' "$SOURCE_BASE_URL"
}

if [ "$CHECK_ENV" = "1" ]; then
  run_check_env
  exit $?
fi

detect_os
require_command curl
require_command uname
require_command ln
require_root
trap on_exit EXIT

ARCH=$(detect_arch)
VERSION=$(resolve_version)
ASSET_NAME="vofly_${VERSION}_linux_${ARCH}"
ASSET_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/${ASSET_NAME}"
SUMS_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/SHA256SUMS"
SIDECAR_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/${ASSET_NAME}.sha256"

printf '安装版本：%s\n目标架构：linux_%s\n安装目录：%s\n' "$VERSION" "$ARCH" "$INSTALL_ROOT"

ensure_install_dirs
write_default_env

if [ "$FORCE" = "0" ] && is_target_installed; then
  ensure_cli_link
  bootstrap_admin "$BINARY_PATH"
  write_systemd_unit
  printf '当前已经是目标版本，已刷新环境、服务和 CLI 链接。\n'
  finish_install
  exit 0
fi

DOWNLOAD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vofly-install.XXXXXX")
download_file "$ASSET_URL" "$DOWNLOAD_DIR/$ASSET_NAME" 755
try_download_file "$SIDECAR_URL" "$DOWNLOAD_DIR/${ASSET_NAME}.sha256" 644 || true
try_download_file "$SUMS_URL" "$DOWNLOAD_DIR/SHA256SUMS" 644 || true
verify_checksum "$DOWNLOAD_DIR/SHA256SUMS" "$DOWNLOAD_DIR/${ASSET_NAME}.sha256" "$ASSET_NAME" "$DOWNLOAD_DIR/$ASSET_NAME"
"$DOWNLOAD_DIR/$ASSET_NAME" version >/dev/null 2>&1 || {
  printf '下载的二进制无法在当前系统运行；未替换现有安装。\n' >&2
  exit 1
}

bootstrap_admin "$DOWNLOAD_DIR/$ASSET_NAME"

if [ -f "$BINARY_PATH" ]; then
  run_root cp -f "$BINARY_PATH" "$BACKUP_PATH"
  printf '已备份旧二进制：%s\n' "$BACKUP_PATH"
fi
run_root install -m 755 "$DOWNLOAD_DIR/$ASSET_NAME" "$BINARY_PATH"
ensure_cli_link
printf '已安装二进制：%s\n' "$BINARY_PATH"

write_systemd_unit
finish_install
