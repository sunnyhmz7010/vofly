import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("phone control lease keeps a per-tab sessionStorage record with heartbeat constants", async () => {
  const lib = await source("src/lib/phoneLease.ts");

  // 租约键与存放形态：sessionStorage 保存 {tabId, acquiredAt}（对齐 hideck_phone_control）。
  assert.match(lib, /PHONE_CONTROL_LEASE_KEY = "vofly\.phone\.control"/);
  assert.match(lib, /interface PhoneControlLease \{\s*tabId: string;\s*acquiredAt: number;/);
  assert.match(lib, /sessionStorage/);

  // 跨标签页可见性依赖共享持有者记录 + 心跳：2s 刷新、6s 判陈旧。
  assert.match(lib, /PHONE_CONTROL_HOLDER_KEY = "vofly\.phone\.control\.holder"/);
  assert.match(lib, /PHONE_LEASE_HEARTBEAT_MS = 2000/);
  assert.match(lib, /PHONE_LEASE_STALE_MS = 6000/);
  assert.match(lib, /export function isLeaseStale/);
  assert.match(lib, /window\.setInterval\(tick, PHONE_LEASE_HEARTBEAT_MS\)/);
  assert.match(lib, /addEventListener\("storage"/);
});

test("lease claim follows hideck takeover semantics: newest claim wins unconditionally", async () => {
  const lib = await source("src/lib/phoneLease.ts");

  // 对齐 hideck（internal/phone/calls.go 的 takeover=true 路径）：声明不做存活检查，
  // 无条件覆盖现有租约与共享持有者记录，最新声明胜出。
  assert.match(lib, /newest claim wins/);
  assert.match(lib, /export function claimPhoneControl/);
  assert.match(lib, /无条件覆盖本地声明与共享持有者记录/);
  assert.match(lib, /export function releasePhoneControl/);
  assert.match(lib, /export function syncPhoneLease/);

  // 清理路径：挂断/卸载/页面关闭释放；崩溃标签页靠 6s 陈旧判定被接管。
  assert.match(lib, /beforeunload/);
  assert.match(lib, /removeEventListener\("beforeunload", onBeforeUnload\);\s*releasePhoneControl\(\);/);
});

test("phone page disables call controls when the lease is foreign and shows the takeover banner", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /usePhoneControlLease/);
  assert.match(phonePage, /通话控制已被另一个标签页接管/);
  assert.match(dict, /"通话控制已被另一个标签页接管": "Call control has been taken over by another tab"/);

  // 拨号输入/按钮、接听、挂断、DTMF 拨号盘全部受 controlsLocked 约束。
  assert.match(phonePage, /disabled=\{dialing \|\| !deviceId \|\| controlsLocked\}/);
  assert.match(phonePage, /disabled=\{!deviceId \|\| controlsLocked\}/);
  assert.match(phonePage, /disabled=\{controlsLocked\}/);
  assert.match(phonePage, /disabled=\{dtmfSending \|\| controlsLocked\}/);

  // 控制动作前声明租约，挂断成功后释放；非控制页仍保留状态轮询。
  assert.match(phonePage, /claim\(\)/);
  assert.match(phonePage, /if \(action === "hangup"\) release\(\)/);
  assert.match(phonePage, /void refresh\(\)/);
  assert.match(phonePage, /window\.setInterval\(\(\) => void refresh\(\), 3000\)/);
});
