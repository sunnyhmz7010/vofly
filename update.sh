#!/bin/sh
# vofly 一键升级脚本。
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/update.sh | sudo sh
#   sudo sh update.sh [版本]

set -eu

REPO="sunnyhmz7010/vofly"
RELEASES_API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASES_LATEST_URL="https://github.com/${REPO}/releases/latest"
RELEASES_DOWNLOAD_URL="https://github.com/${REPO}/releases/download"
USER_AGENT="vofly-updater/1.0 (+https://github.com/${REPO})"

BINARY_PATH="/opt/vofly/bin/vofly"
BACKUP_PATH="/opt/vofly/bin/vofly.bak"
LINK_PATH="/usr/local/bin/vofly"
ENV_FILE="/etc/vofly/env"
OPENWRT_INIT_PATH="/etc/init.d/vofly"
DEFAULT_ADDR="0.0.0.0:7575"

VERSION_ARG=""

print_usage() {
  cat <<'USAGE'
用法:
  sudo sh update.sh [版本]

说明:
  下载指定版本或最新 Release，校验后替换 /opt/vofly/bin/vofly。
  替换前会备份为 /opt/vofly/bin/vofly.bak；服务重启失败时自动回滚。
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
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

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '缺少 %s。\n' "$1" >&2
    exit 1
  }
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  printf '需要 root 权限，请使用 sudo 运行。\n' >&2
  exit 1
}

ensure_cli_link() {
  run_root install -d -m 755 "$(dirname "$LINK_PATH")"
  run_root ln -sfn "$BINARY_PATH" "$LINK_PATH"
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
  printf '无法读取最新 Release，可在命令末尾追加版本号，例如：sudo sh update.sh v0.1.0\n' >&2
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
      if (item == name) {
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

openwrt_service_available() {
  [ -x "$OPENWRT_INIT_PATH" ] && { [ -x /sbin/procd ] || [ -x /sbin/ubusd ]; }
}

restart_service() {
  if openwrt_service_available; then
    if ! run_root "$OPENWRT_INIT_PATH" restart; then
      return 1
    fi
    stable=0
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
      sleep 1
      if run_root "$OPENWRT_INIT_PATH" running >/dev/null 2>&1; then
        stable=$((stable + 1))
        if [ "$stable" -ge 3 ]; then
          return 0
        fi
      else
        stable=0
      fi
    done
    return 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    printf '未检测到 systemd。请手动重启 vofly 进程。\n'
    return 0
  fi
  if ! run_root systemctl daemon-reload; then
    return 1
  fi
  if ! run_root systemctl restart vofly.service; then
    return 1
  fi
  wait_for_service || true
  return 0
}

rollback_binary() {
  if [ -f "$BACKUP_PATH" ]; then
    printf '重启失败，回滚到上一版本。\n' >&2
    run_root install -m 755 "$BACKUP_PATH" "$BINARY_PATH"
    restart_service || true
  fi
}

cleanup_downloads() {
  if [ -n "${DOWNLOAD_DIR:-}" ] && [ -d "$DOWNLOAD_DIR" ]; then
    rm -rf "$DOWNLOAD_DIR"
  fi
}

detect_os
require_command curl
require_command uname

if [ ! -f "$BINARY_PATH" ]; then
  printf '未检测到已安装的 vofly：%s\n请先运行 install.sh。\n' "$BINARY_PATH" >&2
  exit 1
fi

ARCH=$(detect_arch)
VERSION=$(resolve_version)
ASSET_NAME="vofly_${VERSION}_linux_${ARCH}"
ASSET_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/${ASSET_NAME}"
SUMS_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/SHA256SUMS"
SIDECAR_URL="${RELEASES_DOWNLOAD_URL}/${VERSION}/${ASSET_NAME}.sha256"

printf '升级版本：%s\n目标架构：linux_%s\n' "$VERSION" "$ARCH"

DOWNLOAD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vofly-update.XXXXXX")
trap cleanup_downloads EXIT
download_file "$ASSET_URL" "$DOWNLOAD_DIR/$ASSET_NAME" 755
try_download_file "$SIDECAR_URL" "$DOWNLOAD_DIR/${ASSET_NAME}.sha256" 644 || true
try_download_file "$SUMS_URL" "$DOWNLOAD_DIR/SHA256SUMS" 644 || true
verify_checksum "$DOWNLOAD_DIR/SHA256SUMS" "$DOWNLOAD_DIR/${ASSET_NAME}.sha256" "$ASSET_NAME" "$DOWNLOAD_DIR/$ASSET_NAME"

if cmp -s "$DOWNLOAD_DIR/$ASSET_NAME" "$BINARY_PATH"; then
  ensure_cli_link
  printf '当前已经是目标版本，无需升级。\n'
  exit 0
fi

run_root cp -f "$BINARY_PATH" "$BACKUP_PATH"
run_root install -m 755 "$DOWNLOAD_DIR/$ASSET_NAME" "$BINARY_PATH"
ensure_cli_link
printf '已替换二进制：%s\n' "$BINARY_PATH"

if restart_service; then
  printf '升级完成。\n'
else
  rollback_binary
  exit 1
fi
