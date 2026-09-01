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

test("phone page exposes AI call settings in a dialog from the header", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /const \[aiCallDialogOpen, setAICallDialogOpen\] = useState\(false\);/);
  assert.match(phonePage, /<PageHeader[\s\S]*title=\{t\("通话"\)\}[\s\S]*actions=\{[\s\S]*<div className="flex items-center gap-2">/);
  assert.match(phonePage, /<Button variant="default" onClick=\{\(\) => setAICallDialogOpen\(true\)\}>\s*\{t\("AI 通话"\)\}\s*<\/Button>/s);
  assert.match(phonePage, /<RefreshButton loading=\{pageRefreshing\} onClick=\{\(\) => void refreshAll\(\)\} \/>/);
  assert.match(phonePage, /<Modal[\s\S]*open=\{aiCallDialogOpen\}[\s\S]*onClose=\{\(\) => setAICallDialogOpen\(false\)\}[\s\S]*title=\{t\("AI 通话设置"\)\}/);
  assert.match(phonePage, /自动接听/);
  assert.match(phonePage, /VoLTE 来电自动接听/);
  assert.match(dict, /"AI 通话设置": "AI call settings"/);
  assert.match(dict, /"自动接听": "Auto-answer"/);
  assert.match(dict, /"VoLTE 来电自动接听": "Auto-answer VoLTE calls"/);
});
test("phone page keeps AI controls out of the main body while the header dialog remains", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /<Button variant="default" onClick=\{\(\) => setAICallDialogOpen\(true\)\}>\s*\{t\("AI 通话"\)\}\s*<\/Button>/s);
  assert.match(phonePage, /<Modal[\s\S]*title=\{t\("AI 通话设置"\)\}/);
  assert.doesNotMatch(phonePage, /让 AI 接管当前来电/);
  assert.doesNotMatch(phonePage, /预设任务/);
  assert.doesNotMatch(phonePage, /本地预设管理/);
  assert.doesNotMatch(phonePage, /任务目标/);
  assert.doesNotMatch(phonePage, /AI 建单助手/);
  assert.doesNotMatch(phonePage, /AI 外呼/);
  assert.doesNotMatch(phonePage, /AI 批量外呼/);
  assert.doesNotMatch(phonePage, /AI 接管/);
  assert.doesNotMatch(phonePage, /批量队列/);
  assert.doesNotMatch(phonePage, /AI 实时事件/);
  assert.doesNotMatch(phonePage, /AI 通话详情/);
  assert.doesNotMatch(phonePage, /AI 转写/);
  assert.doesNotMatch(phonePage, /AI 时间线/);
  assert.doesNotMatch(phonePage, /AI 摘要/);
  assert.doesNotMatch(phonePage, /结果核实/);
  assert.doesNotMatch(phonePage, /任务判定/);
  assert.doesNotMatch(phonePage, /学习热线情报/);
});
