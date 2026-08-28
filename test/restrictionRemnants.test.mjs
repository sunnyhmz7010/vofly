import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function text(...parts) {
  return parts.join("");
}

function pattern(...parts) {
  return new RegExp(text(...parts));
}

test("settings page keeps SMS rate limit without legacy count controls", async () => {
  const settings = await source("src/pages/SettingsPage.tsx");
  const types = await source("src/types.ts");
  const camelCountKey = text("device", "Limit");

  assert.match(settings, /SMSRateLimitCard/);
  assert.doesNotMatch(settings, pattern("Device", "Quota", "Card"));
  assert.doesNotMatch(settings, new RegExp(camelCountKey));
  assert.doesNotMatch(settings, pattern("设备", "配额"));
  assert.doesNotMatch(settings, pattern("Device", " ", "quota"));
  assert.doesNotMatch(types, new RegExp(text(camelCountKey, "|default", "Device", "Limit|max", "Device", "Limit")));
});

test("devices page does not expose legacy add-device count behavior", async () => {
  const devices = await source("src/pages/DevicesPage.tsx");
  const panel = await source("src/components/devices/DeviceListPanel.tsx");
  const camelCountKey = text("device", "Limit");

  assert.doesNotMatch(devices, new RegExp(text(camelCountKey, "|addAt", "Limit")));
  assert.doesNotMatch(devices, pattern("设备", "数量", "已达", "上限"));
  assert.doesNotMatch(panel, new RegExp(camelCountKey));
  assert.doesNotMatch(panel, pattern("配", "额"));
});

test("legal gate styles and translations are removed from runtime assets", async () => {
  const css = await source("src/vofly.css");
  const translations = await source("src/lib/i18n-en.ts");

  assert.doesNotMatch(css, pattern("dis", "claimer"));
  assert.doesNotMatch(translations, pattern("免责", "声明"));
  assert.doesNotMatch(translations, pattern("最终", "用户", "许可"));
  assert.doesNotMatch(translations, pattern("Agree", " & ", "Continue"));
});
