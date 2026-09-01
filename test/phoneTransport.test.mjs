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

test("phone page loads AI call record details for transcripts and summaries", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /\/call-records\/\$\{encodeURIComponent\(record\.callId\)\}/);
  assert.match(phonePage, /AI 通话详情/);
  assert.match(phonePage, /AI 转写/);
  assert.match(phonePage, /AI 时间线/);
  assert.match(phonePage, /recordDetail\.events\.filter\(\(event\) => event\.type !== "transcript"\)/);
  assert.match(phonePage, /aiEventText\(event\)/);
  assert.match(phonePage, /AI 摘要/);
  assert.match(phonePage, /任务判定/);
  assert.match(phonePage, /aiVerdictText\(recordDetail\.summary\)/);
});

test("phone page displays AI result verification from carrier SMS summaries", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /function aiVerificationText\(summary\?: AICallSummary\)/);
  assert.match(phonePage, /result_verification/);
  assert.match(phonePage, /result_source/);
  assert.match(phonePage, /结果核实/);
  assert.match(phonePage, /已核实/);
  assert.match(phonePage, /aiVerificationText\(recordDetail\.summary\)/);
});

test("phone page displays structured AI summary fields", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /function aiStructuredSummaryFields\(summary\?: AICallSummary\)/);
  assert.match(phonePage, /caller_identity/);
  assert.match(phonePage, /callback_needed/);
  assert.match(phonePage, /const structuredSummaryFields = useMemo\(\(\) => aiStructuredSummaryFields\(recordDetail\?\.summary\), \[recordDetail\?\.summary\]\);/);
  assert.match(phonePage, /structuredSummaryFields\.map\(\(field\) =>/);
  assert.match(dict, /"来电人": "Caller"/);
  assert.match(dict, /"是否回电": "Callback needed"/);
});

test("phone page polls and renders live AI call events while a session is active", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /const \[aiCallEvents, setAICallEvents\] = useState<AICallEvent\[\]>\(\[\]\);/);
  assert.match(phonePage, /const aiEventCursorRef = useRef\(0\);/);
  assert.match(phonePage, /function mergeAICallEvents\(current: AICallEvent\[\], next: AICallEvent\[\]\)/);
  assert.match(phonePage, /\/call-records\/\$\{encodeURIComponent\(callId\)\}\/events\?after_id=\$\{aiEventCursorRef\.current\}&limit=50/);
  assert.match(phonePage, /const aiEventsTimer = window\.setInterval\(\(\) => void loadAICallEvents\(callId\), 2000\);/);
  assert.match(phonePage, /AI 实时事件/);
  assert.match(phonePage, /event\.type === "transcript"/);
  assert.match(phonePage, /event\.type === "tool_call"/);
});

test("phone page renders triage and takeover AI timeline events", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /function aiEventTypeLabel\(event: AICallEvent\)/);
  assert.match(phonePage, /event\.type === "triage"/);
  assert.match(phonePage, /event\.type === "takeover"/);
  assert.match(phonePage, /triageCategoryText/);
  assert.match(phonePage, /takeoverStateText/);
  assert.match(phonePage, /aiEventTypeLabel\(event\)/);
  assert.match(dict, /"智能分诊": "AI triage"/);
  assert.match(dict, /"转接状态": "Takeover status"/);
});

test("phone page lets owner complete or fail a pending AI takeover", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /function hasPendingOwnerTakeover\(events: AICallEvent\[\]\)/);
  assert.match(phonePage, /const pendingOwnerTakeover = useMemo\(\(\) => hasPendingOwnerTakeover\(aiCallEvents\), \[aiCallEvents\]\);/);
  assert.match(phonePage, /async function updateOwnerTakeover\(state: "committed" \| "failed"\)/);
  assert.match(phonePage, /\/ai-calls\/\$\{encodeURIComponent\(activeAISession\.id\)\}\/takeover/);
  assert.match(phonePage, /body: \{ state, reason:/);
  assert.match(phonePage, /pendingOwnerTakeover \? \(/);
  assert.match(phonePage, /updateOwnerTakeover\("committed"\)/);
  assert.match(phonePage, /updateOwnerTakeover\("failed"\)/);
  assert.match(dict, /"本人已接管": "Owner took over"/);
  assert.match(dict, /"转接失败": "Takeover failed"/);
});

test("phone page can update AI task instructions during an active session", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /async function updateAIInstructions\(\)/);
  assert.match(phonePage, /\/ai-calls\/\$\{encodeURIComponent\(activeAISession\.id\)\}\/instructions/);
  assert.match(phonePage, /body: \{ instructions: aiTask\.trim\(\) \}/);
  assert.match(phonePage, /await loadAICallEvents\(activeAISession\.callId\);/);
  assert.match(phonePage, /更新任务/);
});

test("phone page loads AI provider options from backend availability", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /interface AICallProvider/);
  assert.match(phonePage, /const \[aiProviders, setAIProviders\] = useState<AICallProvider\[\]>\(\[\]\);/);
  assert.match(phonePage, /api<\{ data: AICallProvider\[\] \}>\("\/ai-call-providers"\)/);
  assert.match(phonePage, /provider\.supported && provider\.configured/);
  assert.doesNotMatch(phonePage, /value: "doubao", label: "Doubao"/);
});

test("phone page manages AI call owner and persona settings", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /interface AICallSettings/);
  assert.match(phonePage, /const \[aiCallSettings, setAICallSettings\] = useState<AICallSettings>/);
  assert.match(phonePage, /async function loadAICallSettings\(\)/);
  assert.match(phonePage, /api<AICallSettings>\("\/ai-call-settings"\)/);
  assert.match(phonePage, /async function saveAICallSettings\(\)/);
  assert.match(phonePage, /method: "PUT"/);
  assert.match(phonePage, /owner_name: aiCallSettings\.ownerName\.trim\(\)/);
  assert.match(phonePage, /agent_persona: aiCallSettings\.agentPersona\.trim\(\)/);
  assert.match(phonePage, /owner: aiCallSettings\.ownerName\.trim\(\) \|\| "机主"/);
  assert.match(phonePage, /AI 通话身份/);
  assert.match(phonePage, /机主称谓/);
  assert.match(phonePage, /AI 人设称谓/);
  assert.match(dict, /"AI 通话身份": "AI call identity"/);
  assert.match(dict, /"AI 人设称谓": "AI persona"/);
});

test("phone page loads AI call presets and applies number and task", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /interface AICallPreset/);
  assert.match(phonePage, /const \[aiPresets, setAIPresets\] = useState<AICallPreset\[\]>\(\[\]\);/);
  assert.match(phonePage, /api<\{ data: AICallPreset\[\] \}>\("\/ai-call-presets"\)/);
  assert.match(phonePage, /预设任务/);
  assert.match(phonePage, /setDialNumber\(preset\.number\)/);
  assert.match(phonePage, /setAITask\(preset\.task\)/);
});

test("phone page forwards AI preset instruction fields to call requests", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /opening\?: string/);
  assert.match(phonePage, /openingMode\?: "say" \| "wait" \| string/);
  assert.match(phonePage, /dtmfSpokenFollowup\?: boolean/);
  assert.match(phonePage, /resultVerification\?: "none" \| "carrier_sms" \| string/);
  assert.match(phonePage, /const \[selectedAIPreset, setSelectedAIPreset\] = useState<AICallPreset \| null>\(null\);/);
  assert.match(phonePage, /function aiPresetInstructionBody\(\)/);
  assert.match(phonePage, /opening: aiDraftOpening \|\| selectedAIPreset\.opening/);
  assert.match(phonePage, /opening_mode: selectedAIPreset\.openingMode/);
  assert.match(phonePage, /dtmf_spoken_followup: selectedAIPreset\.dtmfSpokenFollowup/);
  assert.match(phonePage, /result_verification: selectedAIPreset\.resultVerification/);
  assert.match(phonePage, /body: \{ number, task: aiTask\.trim\(\), provider: aiProvider, \.\.\.aiPresetInstructionBody\(\) \}/);
  assert.match(phonePage, /body: \{ numbers, task: aiTask\.trim\(\), provider: aiProvider, \.\.\.aiPresetInstructionBody\(\) \}/);
});

test("phone page loads call playbooks and forwards task package context", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /interface AICallPlaybook/);
  assert.match(phonePage, /taskPackage\?: AICallTaskPackage/);
  assert.match(phonePage, /const \[aiPlaybooks, setAIPlaybooks\] = useState<AICallPlaybook\[\]>\(\[\]\);/);
  assert.match(phonePage, /const \[playbooksEnabled, setPlaybooksEnabled\] = useState\(false\);/);
  assert.match(phonePage, /async function loadAIPlaybooks\(\)/);
  assert.match(phonePage, /api<\{ ok: boolean; enabled: boolean; playbooks: AICallPlaybook\[\] \}>\("\/playbooks"\)/);
  assert.match(phonePage, /function matchingAIPlaybook\(number: string\)/);
  assert.match(phonePage, /const selectedAIPlaybook = matchingAIPlaybook\(dialNumber\);/);
  assert.match(phonePage, /task_package: parseAIDraftTaskPackage\(\) \|\| selectedAIPreset\.taskPackage/);
  assert.match(phonePage, /热线情报/);
  assert.match(phonePage, /必采信息/);
  assert.match(phonePage, /IVR 流程/);
  assert.match(dict, /"热线情报": "Hotline playbook"/);
});

test("phone page manages profile task packages and max call seconds", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /maxCallSeconds\?: number/);
  assert.match(phonePage, /taskPackageText\?: string/);
  assert.match(phonePage, /function parseProfileTaskPackage\(\)/);
  assert.match(phonePage, /task_package: parseProfileTaskPackage\(\)/);
  assert.match(phonePage, /max_call_seconds: profileForm\.maxCallSeconds \|\| undefined/);
  assert.match(phonePage, /max_call_seconds: selectedAIPreset\.maxCallSeconds/);
  assert.match(phonePage, /setProfileForm\(\(current\) => \(\{ \.\.\.current, maxCallSeconds: Number\(event\.target\.value\) \|\| undefined \}\)\)/);
  assert.match(phonePage, /任务包 JSON/);
  assert.match(phonePage, /时长上限（秒）/);
  assert.match(dict, /"任务包 JSON": "Task package JSON"/);
});

test("phone page generates and applies AI call intake drafts", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /type AICallTaskPackage = Record<string, Record<string, string> \| string\[\]>/);
  assert.match(phonePage, /interface TaskIntakeMessage/);
  assert.match(phonePage, /interface TaskIntakeResult/);
  assert.match(phonePage, /const \[aiIntakeOpen, setAIIntakeOpen\] = useState\(false\);/);
  assert.match(phonePage, /const \[aiIntakeMessages, setAIIntakeMessages\] = useState<TaskIntakeMessage\[\]>\(\[\]\);/);
  assert.match(phonePage, /const \[aiDraftOpening, setAIDraftOpening\] = useState\(""\);/);
  assert.match(phonePage, /async function requestAICallScenario\(\)/);
  assert.match(phonePage, /api<ScenarioDraftResult>\("\/ai-call-scenario"/);
  assert.match(phonePage, /async function requestAICallIntake\(\)/);
  assert.match(phonePage, /api<TaskIntakeResult>\("\/ai-call-intake"/);
  assert.match(phonePage, /function applyAIIntakeDraft\(draft: TaskIntakeDraft\)/);
  assert.match(phonePage, /setDialNumber\(draft\.number\)/);
  assert.match(phonePage, /setAITask\(draft\.scenario \|\| draft\.task\)/);
  assert.match(phonePage, /setAIDraftTaskPackageText\(draft\.taskPackage \? JSON\.stringify\(draft\.taskPackage, null, 2\) : ""\)/);
  assert.match(phonePage, /task_package: parseAIDraftTaskPackage\(\) \|\| selectedAIPreset\.taskPackage/);
  assert.match(phonePage, /AI 建单助手/);
  assert.match(phonePage, /生成场景策略/);
  assert.match(phonePage, /套用草稿/);
  assert.match(dict, /"AI 建单助手": "AI task intake"/);
  assert.match(dict, /"生成场景策略": "Generate scenario"/);
});

test("phone page learns hotline playbooks from call record details", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /interface PlaybookLearningResult/);
  assert.match(phonePage, /const \[playbookLearningId, setPlaybookLearningId\] = useState\(""\);/);
  assert.match(phonePage, /const \[playbookLearningResult, setPlaybookLearningResult\] = useState<PlaybookLearningResult \| null>\(null\);/);
  assert.match(phonePage, /async function learnCallPlaybook\(callId: string\)/);
  assert.match(phonePage, /\/call-records\/\$\{encodeURIComponent\(callId\)\}\/playbook\/learn/);
  assert.match(phonePage, /body: \{ provider: aiProvider, task_package: parseAIDraftTaskPackage\(\) \|\| selectedAIPreset\?\.taskPackage \}/);
  assert.match(phonePage, /await loadAIPlaybooks\(\);/);
  assert.match(phonePage, /learnCallPlaybook\(recordDetail\.record\.callId\)/);
  assert.match(phonePage, /playbookLearningResult\.learned\?\.newRequiredInfo/);
  assert.match(phonePage, /学习热线情报/);
  assert.match(phonePage, /热线情报学习/);
  assert.match(dict, /"学习热线情报": "Learn hotline playbook"/);
  assert.match(dict, /"热线情报学习": "Hotline playbook learning"/);
});

test("phone page manages local AI number profiles", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /interface ManagedNumberProfile/);
  assert.match(phonePage, /const \[managedProfiles, setManagedProfiles\] = useState<ManagedNumberProfile\[\]>\(\[\]\);/);
  assert.match(phonePage, /function emptyManagedProfile\(\)/);
  assert.match(phonePage, /async function loadManagedProfiles\(\)/);
  assert.match(phonePage, /api<\{ profiles: ManagedNumberProfile\[\]; configured: boolean \}>\("\/number_profiles\/manage"\)/);
  assert.match(phonePage, /async function saveManagedProfile\(\)/);
  assert.match(phonePage, /method: editingProfileID \? "PATCH" : "POST"/);
  assert.match(phonePage, /async function deleteManagedProfile\(profileID: string\)/);
  assert.match(phonePage, /\/number_profiles\/\$\{encodeURIComponent\(profileID\)\}/);
  assert.match(phonePage, /本地预设管理/);
  assert.match(phonePage, /结果校验/);
  assert.match(phonePage, /短信校验/);
  assert.match(dict, /"本地预设管理": "Local preset management"/);
});

test("phone page exposes AI batch dial controls", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /const \[aiBatchNumbers, setAIBatchNumbers\] = useState\(""\);/);
  assert.match(phonePage, /function parseBatchNumbers\(value: string\)/);
  assert.match(phonePage, /async function startAIBatchCall\(\)/);
  assert.match(phonePage, /\/devices\/\$\{encodeURIComponent\(deviceId\)\}\/ai-calls\/batch/);
  assert.match(phonePage, /body: \{ numbers, task: aiTask\.trim\(\), provider: aiProvider, \.\.\.aiPresetInstructionBody\(\) \}/);
  assert.match(phonePage, /setAIBatchNumbers\(""\)/);
  assert.match(phonePage, /AI 批量外呼/);
  assert.match(dict, /"AI 批量外呼": "AI Batch Dial"/);
  assert.match(dict, /"批量号码": "Batch numbers"/);
});

test("phone page displays and cancels AI batch queue", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const dict = await source("src/lib/i18n-en.ts");

  assert.match(phonePage, /interface AIBatchQueueStatus/);
  assert.match(phonePage, /const \[aiBatchQueue, setAIBatchQueue\] = useState<AIBatchQueueStatus>/);
  assert.match(phonePage, /async function loadAIBatchQueue\(\)/);
  assert.match(phonePage, /api<\{ data: AIBatchQueueStatus \}>\(`\/devices\/\$\{encodeURIComponent\(deviceId\)\}\/ai-calls\/batch`\)/);
  assert.match(phonePage, /async function cancelAIBatchQueue\(\)/);
  assert.match(phonePage, /method: "DELETE"/);
  assert.match(phonePage, /await loadAIBatchQueue\(\);/);
  assert.match(phonePage, /aiBatchQueue\.currentNumber/);
  assert.match(phonePage, /aiBatchQueue\.pendingNumbers/);
  assert.match(phonePage, /取消待拨/);
  assert.match(dict, /"批量队列": "Batch queue"/);
  assert.match(dict, /"取消待拨": "Cancel pending"/);
});
