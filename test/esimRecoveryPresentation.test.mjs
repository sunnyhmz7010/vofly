import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const esimTabSource = await readFile(new URL("../src/components/devices/DeviceEsimTab.tsx", import.meta.url), "utf8");
const settingsPageSource = await readFile(new URL("../src/pages/SettingsPage.tsx", import.meta.url), "utf8");

test("eSIM loading timeout points users to modem restart or settings service restart without inline service button", () => {
  assert.match(esimTabSource, /ESIM_LOAD_TIMEOUT_MS/);
  assert.match(esimTabSource, /读取 eSIM 超时/);
  assert.match(esimTabSource, /重启模组/);
  assert.match(esimTabSource, /系统设置/);
  assert.doesNotMatch(esimTabSource, /\/system\/restart/);
});

test("system settings exposes the vofly backend service restart action", () => {
  assert.match(settingsPageSource, /\/system\/restart/);
  assert.match(settingsPageSource, /重启 vofly 后端服务/);
});
