import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("proxy page keeps the sing-box section above the existing SOCKS5 section", async () => {
  const page = await source("src/pages/ProxyPage.tsx");
  const section = await source("src/components/proxy/SingBoxSection.tsx");
  const singBoxSection = page.indexOf("<SingBoxSection");
  const upstreamSection = page.indexOf("<UpstreamSection");

  assert.ok(singBoxSection >= 0);
  assert.ok(upstreamSection > singBoxSection);
  assert.match(page, /\/singbox-proxies/);
  assert.match(page, /\/system\/dependencies/);
  assert.match(section, /127\.0\.0\.1 SOCKS5/);
});

test("sing-box proxy input accepts mainstream URI schemes and hides the original URI while editing", async () => {
  const dialog = await source("src/components/proxy/SingBoxDialog.tsx");
  const page = await source("src/pages/ProxyPage.tsx");

  assert.match(page, /vless\|vmess\|trojan\|ss\|socks5\?/);
  assert.match(dialog, /编辑时仅提供新的 URI，原 URI 不会回显/);
  assert.match(dialog, /VLESS、VMess、Trojan、Shadowsocks 和 SOCKS5 URI/);
});

test("derived SOCKS5 rows remain read-only and optional dependencies are managed from settings", async () => {
  const upstream = await source("src/components/proxy/UpstreamSection.tsx");
  const settings = await source("src/pages/SettingsPage.tsx");
  const dependencies = await source("src/components/settings/OptionalDependenciesCard.tsx");

  assert.match(upstream, /!row\.readOnly \? <Button[\s\S]*?onEdit/);
  assert.match(upstream, /!row\.readOnly \? <Button[\s\S]*?onDelete/);
  assert.match(settings, /OptionalDependenciesCard/);
  assert.match(settings, /item\.id === "pcsc" \|\| item\.id === "ffmpeg"/);
  assert.match(dependencies, /\/system\/dependencies\/\$\{item\.id\}\/\$\{operation\}/);
  assert.match(dependencies, /confirmDialog/);
});

test("sing-box dependency uses the official installer instead of bundled release assets", async () => {
  const workflow = await source(".github/workflows/cd.yml");
  const notices = await source("THIRD_PARTY_NOTICES.md");

  assert.doesNotMatch(workflow, /SING_BOX_VERSION|Download fixed sing-box runtime|sing-box_\$\{/);
  assert.match(workflow, /for f in vofly_\*;/);
  assert.match(notices, /https:\/\/sing-box\.app\/install\.sh/);
  assert.match(notices, /GNU General Public License v3\.0/);
});
