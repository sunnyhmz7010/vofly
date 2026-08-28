#!/bin/sh
# vofly 卸载脚本。
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/sunnyhmz7010/vofly/main/uninstall.sh | sudo sh
#   sudo sh uninstall.sh [--purge]

set -eu

INSTALL_ROOT="/opt/vofly"
BIN_DIR="/opt/vofly/bin"
BINARY_PATH="/opt/vofly/bin/vofly"
BACKUP_PATH="/opt/vofly/bin/vofly.bak"
ENV_DIR="/etc/vofly"
ENV_FILE="/etc/vofly/env"
SYSTEMD_UNIT="/etc/systemd/system/vofly.service"

PURGE=0

print_usage() {
  cat <<'USAGE'
用法:
  sudo sh uninstall.sh [--purge]

选项:
  --purge      同时删除 /opt/vofly 与 /etc/vofly，包含数据库与本机环境文件
  -h|--help    显示帮助

默认卸载只停止并移除服务、删除二进制，保留 /opt/vofly/data 与 /etc/vofly/env。
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --purge) PURGE=1 ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      printf '未知参数：%s\n\n' "$1" >&2
      print_usage
      exit 1
      ;;
  esac
  shift
done

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

safe_purge_path() {
  case "$1" in
    /opt/vofly|/etc/vofly) return 0 ;;
    *)
      printf '拒绝删除非预期路径：%s\n' "$1" >&2
      exit 1
      ;;
  esac
}

if command -v systemctl >/dev/null 2>&1; then
  run_root systemctl stop vofly.service >/dev/null 2>&1 || true
  run_root systemctl disable vofly.service >/dev/null 2>&1 || true
  if [ -f "$SYSTEMD_UNIT" ]; then
    run_root rm -f "$SYSTEMD_UNIT"
    run_root systemctl daemon-reload >/dev/null 2>&1 || true
    run_root systemctl reset-failed vofly.service >/dev/null 2>&1 || true
    printf '已移除 systemd 服务：%s\n' "$SYSTEMD_UNIT"
  fi
fi

for file in "$BINARY_PATH" "$BACKUP_PATH"; do
  if [ -f "$file" ] || [ -L "$file" ]; then
    run_root rm -f "$file"
    printf '已删除：%s\n' "$file"
  fi
done

if [ "$PURGE" = "1" ]; then
  safe_purge_path "$INSTALL_ROOT"
  safe_purge_path "$ENV_DIR"
  run_root rm -rf "$INSTALL_ROOT"
  run_root rm -rf "$ENV_DIR"
  printf '已删除：%s\n已删除：%s\n' "$INSTALL_ROOT" "$ENV_DIR"
else
  if [ -d "$BIN_DIR" ]; then
    rmdir "$BIN_DIR" 2>/dev/null || true
  fi
  printf '已保留数据与环境文件：/opt/vofly/data、%s\n' "$ENV_FILE"
fi

printf '卸载完成。\n'
