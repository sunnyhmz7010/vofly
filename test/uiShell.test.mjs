import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("login form submits explicitly when Enter is pressed in the secret field", async () => {
  const login = await source("src/pages/LoginPage.tsx");

  assert.match(login, /event\.key === ["']Enter["']/);
  assert.match(login, /requestSubmit\(\)/);
});

test("authenticated shell keeps sign out in the top actions instead of a sidebar user card", async () => {
  const shell = await source("src/components/shell/AuthenticatedShell.tsx");

  assert.doesNotMatch(shell, /function userCard/);
  assert.doesNotMatch(shell, /user\?\.username/);
  assert.match(shell, /<SwitchDark[\s\S]*<button[\s\S]*<SignOutRegular/);
});

test("version badge normalizes backend versions that already start with v", async () => {
  const version = await source("src/components/shell/versionFormat.ts");

  assert.match(version, /replace\(\/\^v\+\/i, ""\)/);
  assert.match(version, /formatVersionLabel/);
});

test("frontend removes the old product tagline and heading subtitles", async () => {
  const paths = [
    "index.html",
    "src/App.tsx",
    "src/pages/LoginPage.tsx",
    "src/pages/DashboardPage.tsx",
    "src/pages/DevicesPage.tsx",
    "src/pages/PhonePage.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/SmsPage.tsx",
    "src/components/shell/AuthenticatedShell.tsx",
    "src/components/ui/PageHeader.tsx",
    "src/components/settings/Cards.tsx",
    "src/components/settings/HTTPSCard.tsx",
    "src/components/settings/NetworkAccessCard.tsx",
    "src/components/settings/PluginsCard.tsx",
    "src/components/settings/SMSRateLimitCard.tsx",
    "src/components/devices/CardPolicyPanel.tsx",
    "src/components/devices/PolicySwitchCard.tsx",
    "src/components/proxy/UpstreamDialog.tsx",
    "src/components/proxy/formUi.tsx",
  ];
  const combined = (await Promise.all(paths.map(source))).join("\n");

  assert.doesNotMatch(combined, /高通模块专业测试工具|高通模块测试工具|Qualcomm Module Professional Test Tool|Qualcomm Module Test Tool/);
  assert.doesNotMatch(combined, /subtitle\s*=/);
});

test("security card uses the requested Chinese labels", async () => {
  const cards = await source("src/components/settings/Cards.tsx");

  assert.match(cards, /t\("更改访问密令"\)/);
  assert.match(cards, /t\("确认更改"\)/);
  assert.doesNotMatch(cards, /t\("更新访问凭证"\)|t\("更新凭证"\)/);
});
