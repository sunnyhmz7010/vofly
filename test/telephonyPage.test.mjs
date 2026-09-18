import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("电话助手管理嵌入通话页，不再注册独立路由和侧边栏入口", async () => {
  const app = await source("src/App.tsx");
  const shell = await source("src/components/shell/AuthenticatedShell.tsx");
  const phone = await source("src/pages/PhonePage.tsx");

  assert.doesNotMatch(app, /TelephonyPage/);
  assert.doesNotMatch(shell, /\/telephony/);
  assert.match(phone, /TelephonyPage/);
  assert.match(phone, /电话助手/);
});

test("电话助手管理面板保留核心配置和 AI 规则动作", async () => {
  const page = await source("src/pages/TelephonyPage.tsx");

  assert.match(page, /api<Config>\("\/telephony\/config"\)/);
  assert.match(page, /api<\{ messages\?: MessageItem\[\] \}>\("\/telephony\/voicemail\/messages"\)/);
  assert.match(page, /api\("\/telephony\/rules"/);
  assert.match(page, /<option value="ai">AI<\/option>/);
  assert.match(page, /\/telephony\/recording\/settings/);
  assert.match(page, /<option value="sms">/);
  assert.doesNotMatch(page, /ai-calls\/dial/);
  assert.doesNotMatch(page, /onHangup/);
});

test("实时轮询不会覆盖未保存的电话规则与联系人", async () => {
  const page = await source("src/pages/TelephonyPage.tsx");
  const refresh = page.match(/const loadLive = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/);

  assert.ok(refresh, "应单独刷新实时状态");
  assert.match(page, /setInterval\(\(\) => void loadLive\(\), 8000\)/);
  assert.doesNotMatch(refresh[1], /setConfig\(|setRules\(|setContacts\(/);
});

test("电话助手在英文界面显示英文标题", async () => {
  const dict = await source("src/lib/i18n-en.ts");
  assert.match(dict, /"电话助手": "Phone assistant"/);
});
