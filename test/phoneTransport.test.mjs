import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test('phone page presents "volte" as a registered cellular call transport with browser audio', async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  // 这个测试保护用户现场：后端返回 transport: "volte" 时，页面不能再落入“未注册 IMS”。
  assert.match(phonePage, /transport: "vowifi" \| "volte" \| "cellular" \| string;/);
  assert.match(
    phonePage,
    /function callTransportPresentation\(transport: CallsPayload\["transport"\]\): \{ text: string; tone: StatusTone; webAudioReady: boolean \}/,
  );
  assert.match(phonePage, /case "volte":\s*return \{ text: "VoLTE IMS", tone: "success", webAudioReady: true \};/);
  assert.match(phonePage, /const transportPresentation = callTransportPresentation\(transport\);/);
  assert.match(phonePage, /const webAudioReady = transportPresentation\.webAudioReady;/);
  assert.match(phonePage, /!!deviceId && webAudioReady && !!activeCall && activeCall\.state === "active" && activeCall\.mediaReady === true/);
  assert.match(phonePage, /<StatusDot tone=\{transportPresentation\.tone\} \/>/);
  assert.match(phonePage, /\{t\(transportPresentation\.text\)\}/);
  assert.doesNotMatch(phonePage, /transport === "vowifi" \? t\("VoWiFi IMS"\) : t\("未注册 IMS"\)/);

  assert.match(dict, /"VoLTE IMS": "VoLTE IMS"/);
});

test("phone page maps VoLTE inbound and outbound directions to the existing call labels", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /function callDirectionLabel\(direction: string\)/);
  assert.match(phonePage, /case "outgoing":\s*case "outbound":\s*return "呼出";/);
  assert.match(phonePage, /case "incoming":\s*case "inbound":\s*return "呼入";/);
  assert.match(phonePage, /\{t\(callDirectionLabel\(activeCall\.direction\)\)\} · \{formatClock\(activeCall\.startedAt\)\}/);
  assert.match(phonePage, /\{t\(callDirectionLabel\(record\.direction\)\)\} · \{record\.number \|\| t\("未知号码"\)\}/);
  assert.doesNotMatch(phonePage, /activeCall\.direction === "outgoing" \? t\("呼出"\) : t\("呼入"\)/);
  assert.doesNotMatch(phonePage, /record\.direction === "outgoing" \? t\("呼出"\) : t\("呼入"\)/);
});

test("phone page exposes AI call controls through the backend AI call API", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /ai-calls\/dial/);
  assert.match(phonePage, /ai-calls\/\$\{encodeURIComponent\(activeCall\.id\)\}\/answer/);
  assert.match(phonePage, /api<\{ data: AICallSession\[\] \}>\("\/ai-calls"\)/);
  assert.match(phonePage, /AI 接管/);
  assert.match(phonePage, /任务目标/);
});
