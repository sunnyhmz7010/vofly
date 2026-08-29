import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("settings page exposes the interactive bot notification tabs", async () => {
  const settings = await source("src/pages/SettingsPage.tsx");

  assert.match(settings, /key:\s*"qq"/);
  assert.match(settings, /key:\s*"weixin"/);
  assert.match(settings, /key:\s*"wecomBot"/);
  assert.match(settings, /key:\s*"feishuBot"/);
  assert.match(settings, /<QQTab\b/);
  assert.match(settings, /<WeixinTab\b/);
  assert.match(settings, /<WeComBotTab\b/);
  assert.match(settings, /<FeishuBotTab\b/);
});

test("bot tabs provide manual configuration and QR onboarding for each interactive channel", async () => {
  const tabs = await source("src/components/settings/BotTabs.tsx");

  for (const exportName of ["QQTab", "WeixinTab", "WeComBotTab", "FeishuBotTab"]) {
    assert.match(tabs, new RegExp(`export function ${exportName}\\b`));
  }
  for (const title of ["QQ 扫码注册", "个人微信扫码", "企微机器人扫码", "飞书扫码绑定"]) {
    assert.match(tabs, new RegExp(title));
  }
  for (const field of ["App Secret", "iLink 服务地址", "WebSocket 地址", "允许私聊用户 ID", "允许群聊 ID"]) {
    assert.match(tabs, new RegExp(field));
  }
});

test("notification QR onboarding service keeps the legacy start/status/cancel contract", async () => {
  const qr = await source("src/lib/notificationOnboarding.ts");

  assert.match(qr, /type NotificationQRChannel\s*=\s*"weixin"\s*\|\s*"wecom-bot"\s*\|\s*"qq"\s*\|\s*"feishu-bot"/);
  assert.match(qr, /\/settings\/notifications\/\$\{channel\}\/qr\/start/);
  assert.match(qr, /\/settings\/notifications\/\$\{channel\}\/qr\/status\?session_id=/);
  assert.match(qr, /\/settings\/notifications\/\$\{channel\}\/qr\/cancel/);
  assert.match(qr, /POLL_INTERVAL_MS\s*=\s*1500/);
});
