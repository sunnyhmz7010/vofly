import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("电话助手路由和侧边栏入口已注册", async () => {
  const app = await source("src/App.tsx");
  const shell = await source("src/components/shell/AuthenticatedShell.tsx");

  assert.match(app, /<Route path="telephony" element={<TelephonyPage \/>} \/>/);
  assert.match(shell, /\{ to: "\/telephony", label: "电话助手"/);
});

test("电话助手页面加载核心电话数据并暴露 AI 规则动作", async () => {
  const page = await source("src/pages/TelephonyPage.tsx");

  assert.match(page, /api<Config>\("\/telephony\/config"\)/);
  assert.match(page, /api<Session\[]>\("\/telephony\/ai\/sessions"\)/);
  assert.match(page, /api<\{ messages\?: MessageItem\[\] \}>\("\/telephony\/voicemail\/messages"\)/);
  assert.match(page, /api\("\/telephony\/rules"/);
  assert.match(page, /<option value="ai">AI<\/option>/);
  assert.match(page, /\/telephony\/ai\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/hangup/);
  assert.match(page, /\/telephony\/recording\/settings/);
  assert.match(page, /<option value="sms">/);
});
