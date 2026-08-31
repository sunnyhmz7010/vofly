import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("installer installs and records required modem runtime dependencies", async () => {
  const install = await source("install.sh");

  assert.match(install, /install_runtime_dependencies/);
  assert.match(install, /sudo sh install\.sh \[--force\] \[--with-pcsc\] \[--with-ffmpeg\]/);
  assert.match(install, /libqmi-utils/);
  assert.match(install, /qmi-utils/);
  assert.match(install, /iproute2/);
  assert.match(install, /ca-certificates/);
  assert.match(install, /installed-packages/);
  assert.match(install, /%s\|%s/);
  assert.match(install, /command -v ip/);
  assert.doesNotMatch(install, /CHECK_ENV|--check-env|run_check_env/);
});

test("installer creates and starts an OpenWrt procd service", async () => {
  const install = await source("install.sh");

  assert.match(install, /OPENWRT_INIT_PATH="\/etc\/init\.d\/vofly"/);
  assert.match(install, /write_openwrt_init/);
  assert.match(install, /procd_set_param command "\$PROGRAM" serve/);
  assert.match(install, /\[ -x \/sbin\/procd \] \|\| \[ -x \/sbin\/ubusd \]/);
  assert.match(install, /"\$OPENWRT_INIT_PATH" enable/);
  assert.match(install, /"\$OPENWRT_INIT_PATH" restart/);
});

test("updater and uninstaller handle OpenWrt init.d services", async () => {
  const update = await source("update.sh");
  const uninstall = await source("uninstall.sh");

  assert.match(update, /OPENWRT_INIT_PATH="\/etc\/init\.d\/vofly"/);
  assert.match(update, /"\$OPENWRT_INIT_PATH" restart/);
  assert.match(uninstall, /OPENWRT_INIT_PATH="\/etc\/init\.d\/vofly"/);
  assert.match(uninstall, /"\$OPENWRT_INIT_PATH" stop/);
  assert.match(uninstall, /"\$OPENWRT_INIT_PATH" disable/);
  assert.match(uninstall, /rm -f "\$OPENWRT_INIT_PATH"/);
});

test("installer no longer exposes a check-only mode", async () => {
  const install = await source("install.sh");
  const readme = await source("README.md");

  assert.doesNotMatch(install, /--check-env/);
  assert.doesNotMatch(install, /CHECK_ENV/);
  assert.doesNotMatch(readme, /仅检查依赖不安装|--check-env/);
});

test("uninstaller removes application link and only recorded packages", async () => {
  const uninstall = await source("uninstall.sh");

  assert.match(uninstall, /LINK_PATH="\/usr\/local\/bin\/vofly"/);
  assert.match(uninstall, /INSTALLED_PACKAGES_FILE=.*installed-packages/);
  assert.match(uninstall, /remove_recorded_packages/);
  assert.match(uninstall, /apt-get remove/);
  assert.match(uninstall, /rm -f "\$LINK_PATH"/);
});
