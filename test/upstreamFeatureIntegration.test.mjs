import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const typesSource = await read("src/types.ts");
const actionsSource = await read("src/components/devices/deviceActions.ts");
const settingsSource = await read("src/pages/SettingsPage.tsx");
const cardPolicySource = await read("src/components/devices/CardPolicyPanel.tsx");
const esimPolicySource = await read("src/components/devices/EsimCardPolicyInline.tsx");

test("declares the SMS and VoWiFi settings returned by the synced backend", () => {
  assert.match(typesSource, /export interface SMSSettings/);
  assert.match(typesSource, /autoClearModemStorage/);
  assert.match(settingsSource, /settings\/sms/);
  assert.match(settingsSource, /settings\/vowifi/);
  assert.match(settingsSource, /SMSAutoClearCard/);
  assert.match(settingsSource, /VoWiFiMTUCard/);
});

test("exposes per-card MBN selection through both card policy surfaces", () => {
  assert.match(typesSource, /mbnProfile\??:/);
  assert.match(actionsSource, /mbnProfile\??:/);
  assert.equal(existsSync(new URL("../src/components/devices/CardPolicyMBN.tsx", import.meta.url)), true);
  assert.match(cardPolicySource, /CardPolicyMBN/);
  assert.match(esimPolicySource, /CardPolicyMBN/);
});

test("offers automatic and carrier-specific MBN choices", async () => {
  const source = await read("src/components/devices/CardPolicyMBN.tsx");
  assert.match(source, /自动（按卡的 HPLMN 选择）/);
  assert.match(source, /OpenMkt-Commercial-CU/);
  assert.match(source, /Volte_OpenMkt-Commercial-CMCC/);
  assert.match(source, /OpenMkt-Commercial-CT/);
});
