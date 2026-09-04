import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function splitPhoneAIDialog(phonePage) {
  const marker = phonePage.match(/<Modal\r?\n\s+open=\{aiCallDialogOpen\}/);
  const start = marker?.index ?? -1;
  assert.notEqual(start, -1, "AI call modal marker is missing");
  const end = phonePage.indexOf("<QrSendModal", start);
  assert.notEqual(end, -1, "AI call modal end marker is missing");
  return {
    mainBody: phonePage.slice(0, start),
    dialog: phonePage.slice(start, end),
  };
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
  const { mainBody, dialog } = splitPhoneAIDialog(phonePage);

  assert.match(phonePage, /<Button variant="default" onClick=\{\(\) => setAICallDialogOpen\(true\)\}>\s*\{t\("AI 通话"\)\}\s*<\/Button>/s);
  assert.match(phonePage, /<Modal[\s\S]*title=\{t\("AI 通话设置"\)\}/);
  assert.match(dialog, /className="ai-call-control-panel/);
  assert.match(dialog, /让 AI 接管当前来电/);
  assert.match(dialog, /预设任务/);
  assert.match(dialog, /本地预设管理/);
  assert.match(dialog, /任务目标/);
  assert.match(dialog, /AI 建单助手/);
  assert.match(dialog, /AI 外呼/);
  assert.match(dialog, /AI 批量外呼/);
  assert.match(dialog, /AI 接管/);
  assert.match(dialog, /批量队列/);
  assert.match(dialog, /AI 实时事件/);
  assert.match(dialog, /AI 通话详情/);
  assert.match(dialog, /AI 转写/);
  assert.match(dialog, /AI 时间线/);
  assert.match(dialog, /AI 摘要/);
  assert.match(dialog, /结果核实/);
  assert.match(dialog, /任务判定/);
  assert.match(dialog, /学习热线情报/);
  assert.doesNotMatch(mainBody, /让 AI 接管当前来电/);
  assert.doesNotMatch(mainBody, /预设任务/);
  assert.doesNotMatch(mainBody, /本地预设管理/);
  assert.doesNotMatch(mainBody, /任务目标/);
  assert.doesNotMatch(mainBody, /AI 建单助手/);
  assert.doesNotMatch(mainBody, /AI 外呼/);
  assert.doesNotMatch(mainBody, /AI 批量外呼/);
  assert.doesNotMatch(mainBody, /AI 接管/);
  assert.doesNotMatch(mainBody, /批量队列/);
  assert.doesNotMatch(mainBody, /AI 实时事件/);
  assert.doesNotMatch(mainBody, /AI 通话详情/);
  assert.doesNotMatch(mainBody, /AI 转写/);
  assert.doesNotMatch(mainBody, /AI 时间线/);
  assert.doesNotMatch(mainBody, /AI 摘要/);
  assert.doesNotMatch(mainBody, /结果核实/);
  assert.doesNotMatch(mainBody, /任务判定/);
  assert.doesNotMatch(mainBody, /学习热线情报/);
});

test("phone page uses the screenshot-style dialer layout with right-side call cards", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /className="phone-main-layout grid grid-cols-1 gap-4 xl:grid-cols-\[minmax\(360px,420px\)_minmax\(0,1fr\)\]"/);
  assert.match(phonePage, /className="phone-dialer-card ui-card flex min-h-\[620px\] flex-col p-5"/);
  assert.match(phonePage, /\{t\("通话设备"\)\}/);
  assert.match(phonePage, /placeholder=\{t\("输入或粘贴号码"\)\}/);
  assert.match(phonePage, /className="phone-dialpad grid grid-cols-3 gap-3"/);
  assert.match(phonePage, /className="phone-side-stack flex min-h-\[620px\] flex-col gap-4"/);
  assert.match(phonePage, /className="ui-card flex min-h-\[300px\] flex-col p-5"/);
  assert.match(phonePage, /className="ui-card flex min-h-\[300px\] flex-1 flex-col p-5"/);
  assert.match(phonePage, /className="phone-empty-state flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white\/10 dark:text-gray-500"/);
  assert.match(phonePage, /\{t\("最近通话"\)\}/);
  assert.doesNotMatch(phonePage, /<h3 className="mb-3 text-sm font-bold text-gray-900 dark:text-gray-100">\{t\("通话记录与录音"\)\}<\/h3>/);
  assert.match(dict, /"通话设备": "Call device"/);
  assert.match(dict, /"输入或粘贴号码": "Enter or paste a number"/);
  assert.match(dict, /"最近通话": "Recent calls"/);
});

test("phone page labels CallPilot AI event types instead of showing raw event names", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /event\.type === "triage_restriction_check"\) return "分诊边界检查";/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"\) return "按键结果";/);
  assert.match(phonePage, /event\.type === "prompt_gen"\) return "动态场景";/);
  assert.match(phonePage, /event\.type === "latency"\) return "延迟指标";/);
  assert.match(phonePage, /event\.type === "wrap_up_judge"\) return "收尾裁判";/);
  assert.match(phonePage, /event\.type === "hold_started"\) return "排队等待";/);
  assert.match(phonePage, /event\.type === "hold_ended"\) return "等待结束";/);
  assert.match(phonePage, /event\.type === "agent_audio_dropped"\) return "AI 音频抑制";/);
  assert.match(phonePage, /event\.type === "instruction_update"\) return "任务更新";/);
  assert.match(phonePage, /event\.type === "task_goal"\) return "目标记录";/);
  assert.match(phonePage, /event\.type === "ended"\) return "通话结束";/);
  assert.match(phonePage, /event\.type === "failed"\) return "通话失败";/);
  assert.match(dict, /"分诊边界检查": "Triage boundary check"/);
  assert.match(dict, /"按键结果": "DTMF result"/);
  assert.match(dict, /"动态场景": "Dynamic scenario"/);
  assert.match(dict, /"延迟指标": "Latency metric"/);
  assert.match(dict, /"收尾裁判": "Wrap-up judge"/);
  assert.match(dict, /"排队等待": "On hold"/);
  assert.match(dict, /"等待结束": "Hold ended"/);
  assert.match(dict, /"AI 音频抑制": "AI audio suppressed"/);
  assert.match(dict, /"目标记录": "Goal record"/);
});

test("phone page renders CallPilot AI event payloads as readable timeline text", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /event\.type === "triage_restriction_check"[\s\S]*payload\.status === "violation"[\s\S]*分诊越界/);
  assert.match(phonePage, /event\.type === "triage_restriction_check"[\s\S]*payload\.status === "compliant"[\s\S]*未发现越界话术/);
  assert.match(phonePage, /event\.type === "triage_restriction_check"[\s\S]*检查不可用/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"[\s\S]*payload\.digits[\s\S]*对端响应/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"[\s\S]*payload\.menu_before[\s\S]*按键前/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"[\s\S]*payload\.remote_after[\s\S]*按键后/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"[\s\S]*payload\.latency_ms[\s\S]*延迟/);
  assert.match(phonePage, /event\.type === "dtmf_outcome"[\s\S]*payload\.expired[\s\S]*未观察到对端响应/);
  assert.match(phonePage, /payload\.status === "late"[\s\S]*响应超出观察窗/);
  assert.match(phonePage, /event\.type === "prompt_gen"[\s\S]*payload\.ok[\s\S]*已生成动态场景/);
  assert.match(phonePage, /event\.type === "prompt_gen"[\s\S]*payload\.scenario[\s\S]*场景：/);
  assert.match(phonePage, /event\.type === "prompt_gen"[\s\S]*payload\.opening[\s\S]*开场：/);
  assert.match(phonePage, /event\.type === "prompt_gen"[\s\S]*未使用动态场景/);
  assert.match(phonePage, /event\.type === "prompt_gen"[\s\S]*payload\.error/);
  assert.match(phonePage, /event\.type === "latency"[\s\S]*payload\.stage[\s\S]*provider 首音频/);
  assert.match(phonePage, /event\.type === "latency"[\s\S]*payload\.ms[\s\S]*ms/);
  assert.match(phonePage, /event\.type === "wrap_up_judge"[\s\S]*payload\.decision[\s\S]*payload\.reason/);
  assert.match(phonePage, /event\.type === "hold_ended"[\s\S]*payload\.seconds[\s\S]*秒/);
  assert.match(phonePage, /event\.type === "agent_audio_dropped"[\s\S]*已抑制 AI 音频[\s\S]*payload\.guard_ms/);
  assert.match(phonePage, /event\.type === "task_goal"[\s\S]*return event\.text \|\| "目标记录";/);
  assert.match(phonePage, /event\.type === "instruction_update"[\s\S]*return event\.text \|\| "任务更新";/);
  assert.doesNotMatch(phonePage, /return event\.text \|\| event\.type;/);
});

test("phone page keeps AI metrics and review labels inside the AI dialog", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");
  const { mainBody, dialog } = splitPhoneAIDialog(phonePage);

  assert.match(phonePage, /interface AICallMetricsReport/);
  assert.match(phonePage, /const \[aiMetrics, setAICallMetrics\] = useState<AICallMetricsReport \| null>\(null\);/);
  assert.match(phonePage, /api<\{ data: AICallMetricsReport \}>\("\/ai-call-metrics\?limit=100"\)/);
  assert.match(phonePage, /markAICallReview\(call\.callId, "correct"\)/);
  assert.match(phonePage, /markAICallReview\(call\.callId, "wrong"\)/);
  assert.match(phonePage, /markAICallReview\(call\.callId, "unsure"\)/);
  assert.match(dialog, /AI 通话指标/);
  assert.match(dialog, /待复核/);
  assert.match(dialog, /标为正确/);
  assert.match(dialog, /标为错误/);
  assert.match(dialog, /看不出来/);
  assert.doesNotMatch(mainBody, /AI 通话指标/);
  assert.doesNotMatch(mainBody, /待复核/);

  assert.match(dict, /"AI 通话指标": "AI call metrics"/);
  assert.match(dict, /"待复核": "Needs review"/);
  assert.match(dict, /"标为正确": "Mark correct"/);
  assert.match(dict, /"标为错误": "Mark wrong"/);
  assert.match(dict, /"看不出来": "Unsure"/);
});
