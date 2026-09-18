import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AddRegular, CallRegular, DeleteRegular, DismissRegular, SaveRegular, SettingsRegular } from "@fluentui/react-icons";
import { api, apiMessage } from "../api";
import { Button, Input, PageHeader, Switch, Tag, Textarea, message } from "../components/ui";
import { useI18n } from "../lib/i18n";

type Tab = "overview" | "rules" | "contacts" | "voicemail" | "recording" | "sip" | "keepalive";
type Action = "allow" | "reject" | "answer" | "voicemail" | "ai";

interface Rule {
  id: string;
  enabled: boolean;
  match: string;
  value?: string;
  action: Action;
  deviceId?: string;
  delaySeconds?: number;
  provider?: string;
  task?: string;
  opening?: string;
  openingMode?: string;
  maxCallSeconds?: number;
  taskPackage?: Record<string, Record<string, string>>;
}

interface Contact { name: string; numbers: string[]; note?: string }
interface Device { id: string; name: string; online?: boolean }
interface Session { id: string; callId: string; deviceId: string; number?: string; state: string; provider: string; direction: string; task?: string }
interface MessageItem { id: string; caller: string; path: string; seconds: number; read: boolean; createdAt: string }
interface Config {
  rules: Rule[]; fallback: Action; contacts: Contact[];
  voicemail: { enabled: boolean; greetingPath?: string; maxSeconds: number; silenceSeconds: number };
  recording: { enabled: boolean; direction: string; maxSeconds: number; retentionDays: number };
  sip: { enabled: boolean; username: string; password?: string; listenAddress: string; advertiseIp?: string; deviceId: string; allowedSources?: string[] };
  keepalive: Array<{ id: string; name: string; enabled: boolean; deviceId: string; kind: "call" | "sms"; target: string; message?: string; durationSeconds?: number; intervalHours: number; onlyIfIdleHours?: number; lastStatus?: string }>;
}

const emptyRule = (): Rule => ({ id: `rule-${Date.now()}`, enabled: true, match: "unknown", action: "allow", value: "", provider: "fake", task: "", opening: "" });
const cardClass = "ui-glass rounded-xl border border-gray-200/80 p-4 shadow-sm dark:border-white/10";
const labelClass = "mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400";
const fieldClass = "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-sky-400 dark:border-white/15 dark:bg-black/20 dark:text-gray-100";

function formatTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function TelephonyPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [config, setConfig] = useState<Config | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [calls, setCalls] = useState<Array<Record<string, unknown>>>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draftRule, setDraftRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [outbound, setOutbound] = useState({ deviceId: "", number: "", provider: "fake", task: "" });

  const load = useCallback(async () => {
    try {
      const [telephony, deviceData, callData, messageData, sessionData] = await Promise.all([
        api<Config>("/telephony/config"),
        api<{ devices?: Device[] }>("/devices"),
        api<{ calls?: Array<Record<string, unknown>> }>("/telephony/calls?limit=30"),
        api<{ messages?: MessageItem[] }>("/telephony/voicemail/messages"),
        api<Session[]>("/telephony/ai/sessions"),
      ]);
      setConfig(telephony);
      setRules(telephony.rules || []);
      setContacts(telephony.contacts || []);
      setDevices(deviceData.devices || []);
      setCalls(callData.calls || []);
      setMessages(messageData.messages || []);
      setSessions(sessionData || []);
      setOutbound((current) => ({ ...current, deviceId: current.deviceId || deviceData.devices?.[0]?.id || "" }));
    } catch (error) {
      message.error(apiMessage(error));
    }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 8000); return () => window.clearInterval(timer); }, [load]);

  async function saveRules() {
    if (!config) return;
    setSaving(true);
    try {
      await api("/telephony/rules", { method: "PUT", body: { rules, fallback: config.fallback } });
      message.success(t("规则已保存"));
      await load();
    } catch (error) { message.error(apiMessage(error)); } finally { setSaving(false); }
  }

  async function saveConfigPart(path: string, body: unknown, success: string) {
    setSaving(true);
    try { await api(path, { method: "PUT", body }); message.success(t(success)); await load(); }
    catch (error) { message.error(apiMessage(error)); } finally { setSaving(false); }
  }

  async function startOutbound() {
    if (!outbound.deviceId || !outbound.number) return;
    try {
      await api(`/devices/${encodeURIComponent(outbound.deviceId)}/ai-calls/dial`, { method: "POST", body: outbound });
      message.success(t("AI 通话已启动"));
      await load();
    } catch (error) { message.error(apiMessage(error)); }
  }

  async function hangup(sessionId: string) {
    try { await api(`/telephony/ai/sessions/${encodeURIComponent(sessionId)}/hangup`, { method: "POST" }); await load(); }
    catch (error) { message.error(apiMessage(error)); }
  }

  const tabs = useMemo(() => [
    ["overview", t("总览")], ["rules", t("来电规则")], ["contacts", t("联系人")],
    ["voicemail", t("语音信箱")], ["recording", t("通话录音")], ["sip", "SIP"], ["keepalive", t("保号任务")],
  ] as Array<[Tab, string]>, [t]);

  if (!config) return <div className="p-8 text-sm text-gray-500">{t("正在加载电话助手...")}</div>;

  return (
    <div className="space-y-5">
      <PageHeader title={t("电话助手")} />
      <p className="-mt-4 text-sm text-gray-500 dark:text-gray-400">{t("电话规则、AI 接听、语音留言与 SIP 在核心服务中统一运行。")} </p>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2 dark:border-white/10">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? "bg-sky-500 text-white" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"}`}>{label}</button>)}
      </div>

      {tab === "overview" && <Overview config={config} calls={calls} messages={messages} sessions={sessions} devices={devices} outbound={outbound} setOutbound={setOutbound} onDial={startOutbound} onHangup={hangup} onRefresh={load} />}
      {tab === "rules" && <RulesEditor rules={rules} setRules={setRules} fallback={config.fallback} setFallback={(fallback) => setConfig({ ...config, fallback })} draft={draftRule} setDraft={setDraftRule} onSave={saveRules} saving={saving} />}
      {tab === "contacts" && <ContactsEditor contacts={contacts} setContacts={setContacts} onSave={() => saveConfigPart("/telephony/contacts", { contacts }, "联系人已保存")} saving={saving} />}
      {tab === "voicemail" && <VoicemailEditor config={config} onSave={(voicemail) => saveConfigPart("/telephony/voicemail/settings", voicemail, "语音信箱设置已保存")} />}
      {tab === "recording" && <RecordingEditor config={config} onSave={(recording) => saveConfigPart("/telephony/recording/settings", recording, "录音设置已保存")} />}
      {tab === "sip" && <SIPEditor config={config} devices={devices} onSave={(sip) => saveConfigPart("/telephony/sip/settings", sip, "SIP 设置已保存")} />}
      {tab === "keepalive" && <KeepaliveEditor config={config} devices={devices} onSave={(keepalive) => saveConfigPart("/telephony/keepalive", { keepalive }, "保号任务已保存")} />}
    </div>
  );
}

function Overview({ config, calls, messages, sessions, devices, outbound, setOutbound, onDial, onHangup, onRefresh }: { config: Config; calls: Array<Record<string, unknown>>; messages: MessageItem[]; sessions: Session[]; devices: Device[]; outbound: { deviceId: string; number: string; provider: string; task: string }; setOutbound: (value: { deviceId: string; number: string; provider: string; task: string }) => void; onDial: () => void; onHangup: (id: string) => void; onRefresh: () => void }) {
  const { t } = useI18n();
  return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label={t("规则")} value={config.rules.length} /><Metric label={t("通话记录")} value={calls.length} /><Metric label={t("未读留言")} value={messages.filter((item) => !item.read).length} /><Metric label={t("AI 会话")} value={sessions.length} /></div>
    <section className={cardClass}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("AI 外呼")}</h2><Button size="small" icon={<CallRegular />} onClick={onDial}>{t("拨打")}</Button></div><div className="grid gap-3 md:grid-cols-4"><Field label={t("设备")}><select className={fieldClass} value={outbound.deviceId} onChange={(event) => setOutbound({ ...outbound, deviceId: event.target.value })}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name || device.id}</option>)}</select></Field><Field label={t("号码")}><Input value={outbound.number} onChange={(event) => setOutbound({ ...outbound, number: event.target.value })} placeholder="10086" /></Field><Field label={t("Provider")}><Input value={outbound.provider} onChange={(event) => setOutbound({ ...outbound, provider: event.target.value })} /></Field><Field label={t("任务") }><Input value={outbound.task} onChange={(event) => setOutbound({ ...outbound, task: event.target.value })} placeholder={t("例如查询套餐余额")} /></Field></div></section>
    <section className={cardClass}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("进行中的 AI 会话")}</h2><Button size="small" icon={<SettingsRegular />} onClick={onRefresh}>{t("刷新")}</Button></div>{sessions.length === 0 ? <p className="text-sm text-gray-400">{t("暂无活动会话")}</p> : <div className="space-y-2">{sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3 dark:border-white/10"><div><div className="font-medium">{session.number || session.callId}</div><div className="text-xs text-gray-500">{session.provider} · {session.state} · {session.task || t("未填写任务")}</div></div><Button size="small" variant="danger" icon={<DismissRegular />} onClick={() => onHangup(session.id)}>{t("挂断")}</Button></div>)}</div>}</section>
    <section className={cardClass}><h2 className="mb-3 font-semibold">{t("最近来电")}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-gray-500"><tr><th className="pb-2">{t("号码")}</th><th className="pb-2">{t("方向")}</th><th className="pb-2">{t("状态")}</th><th className="pb-2">{t("时间")}</th></tr></thead><tbody>{calls.slice(0, 8).map((call, index) => <tr key={String(call.id || index)} className="border-t border-gray-100 dark:border-white/5"><td className="py-2">{String(call.peer || call.number || "--")}</td><td className="py-2">{String(call.direction || "--")}</td><td className="py-2"><Tag>{String(call.state || "--")}</Tag></td><td className="py-2 text-gray-500">{formatTime(String(call.updatedAt || call.startedAt || ""))}</td></tr>)}</tbody></table></div></section>
  </>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className={cardClass}><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold text-sky-500">{value}</div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className={labelClass}>{label}</span>{children}</label>; }

function RulesEditor({ rules, setRules, fallback, setFallback, draft, setDraft, onSave, saving }: { rules: Rule[]; setRules: (value: Rule[]) => void; fallback: Action; setFallback: (value: Action) => void; draft: Rule | null; setDraft: (value: Rule | null) => void; onSave: () => void; saving: boolean }) {
  const { t } = useI18n();
  const update = (index: number, patch: Partial<Rule>) => setRules(rules.map((rule, item) => item === index ? { ...rule, ...patch } : rule));
  return <section className={cardClass}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{t("来电规则")}</h2><p className="text-xs text-gray-500">{t("按顺序匹配，第一条命中的规则生效。AI 动作直接进入核心 AI 通话。")}</p></div><div className="flex gap-2"><Button size="small" icon={<AddRegular />} onClick={() => setDraft(emptyRule())}>{t("新增规则")}</Button><Button size="small" variant="primary" loading={saving} icon={<SaveRegular />} onClick={onSave}>{t("保存")}</Button></div></div><div className="mb-4 flex items-center gap-3"><span className="text-sm text-gray-500">{t("无匹配时")}</span><select className={`${fieldClass} max-w-40`} value={fallback} onChange={(event) => setFallback(event.target.value as Action)}><option value="allow">{t("允许")}</option><option value="reject">{t("拒接")}</option><option value="answer">{t("接听")}</option><option value="voicemail">{t("语音留言")}</option><option value="ai">AI</option></select></div><div className="space-y-2">{rules.map((rule, index) => <div key={rule.id} className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-white/10 md:grid-cols-[auto_1fr_1fr_1fr_auto] md:items-end"><Switch checked={rule.enabled} onChange={(checked) => update(index, { enabled: checked })} /><Field label={t("匹配") }><select className={fieldClass} value={rule.match} onChange={(event) => update(index, { match: event.target.value })}><option value="any">{t("所有来电")}</option><option value="number">{t("号码")}</option><option value="prefix">{t("号码前缀")}</option><option value="contact">{t("联系人")}</option><option value="unknown">{t("未知号码")}</option><option value="anonymous">{t("匿名号码")}</option></select></Field><Field label={t("匹配值")}><Input value={rule.value || ""} onChange={(event) => update(index, { value: event.target.value })} /></Field><Field label={t("动作")}><select className={fieldClass} value={rule.action} onChange={(event) => update(index, { action: event.target.value as Action })}><option value="allow">{t("允许")}</option><option value="reject">{t("拒接")}</option><option value="answer">{t("接听")}</option><option value="voicemail">{t("语音留言")}</option><option value="ai">AI</option></select></Field><Button size="small" variant="danger" icon={<DeleteRegular />} onClick={() => setRules(rules.filter((_, item) => item !== index))} aria-label={t("删除规则")} /></div>)}</div>{draft && <RuleDialog rule={draft} onChange={setDraft} onClose={() => setDraft(null)} onAdd={() => { setRules([...rules, draft]); setDraft(null); }} />}</section>;
}

function RuleDialog({ rule, onChange, onClose, onAdd }: { rule: Rule; onChange: (rule: Rule) => void; onClose: () => void; onAdd: () => void }) { const { t } = useI18n(); return <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-500/30 dark:bg-sky-500/10"><div className="mb-3 flex justify-between"><h3 className="font-semibold">{t("新增规则")}</h3><button type="button" onClick={onClose} aria-label={t("关闭")}><DismissRegular /></button></div><div className="grid gap-3 md:grid-cols-2"><Field label={t("匹配类型")}><select className={fieldClass} value={rule.match} onChange={(event) => onChange({ ...rule, match: event.target.value })}><option value="any">{t("所有来电")}</option><option value="number">{t("号码")}</option><option value="prefix">{t("号码前缀")}</option><option value="contact">{t("联系人")}</option><option value="unknown">{t("未知号码")}</option><option value="anonymous">{t("匿名号码")}</option></select></Field><Field label={t("动作")}><select className={fieldClass} value={rule.action} onChange={(event) => onChange({ ...rule, action: event.target.value as Action })}><option value="allow">{t("允许")}</option><option value="reject">{t("拒接")}</option><option value="answer">{t("接听")}</option><option value="voicemail">{t("语音留言")}</option><option value="ai">AI</option></select></Field><Field label={t("匹配值")}><Input value={rule.value || ""} onChange={(event) => onChange({ ...rule, value: event.target.value })} /></Field>{rule.action === "ai" && <><Field label="Provider"><Input value={rule.provider || "fake"} onChange={(event) => onChange({ ...rule, provider: event.target.value })} /></Field><Field label={t("任务")}><Textarea value={rule.task || ""} onChange={(event) => onChange({ ...rule, task: event.target.value })} rows={3} /></Field><Field label={t("开场白")}><Input value={rule.opening || ""} onChange={(event) => onChange({ ...rule, opening: event.target.value })} /></Field></>}</div><div className="mt-3 flex justify-end"><Button variant="primary" onClick={onAdd}>{t("添加")}</Button></div></div>; }

function ContactsEditor({ contacts, setContacts, onSave, saving }: { contacts: Contact[]; setContacts: (value: Contact[]) => void; onSave: () => void; saving: boolean }) { const { t } = useI18n(); const add = () => setContacts([...contacts, { name: "", numbers: [""] }]); const update = (index: number, patch: Partial<Contact>) => setContacts(contacts.map((contact, item) => item === index ? { ...contact, ...patch } : contact)); return <section className={cardClass}><div className="mb-4 flex justify-between"><h2 className="font-semibold">{t("联系人")}</h2><div className="flex gap-2"><Button size="small" icon={<AddRegular />} onClick={add}>{t("新增联系人")}</Button><Button size="small" variant="primary" loading={saving} icon={<SaveRegular />} onClick={onSave}>{t("保存")}</Button></div></div><div className="space-y-2">{contacts.map((contact, index) => <div key={`${contact.name}-${index}`} className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-white/10 md:grid-cols-[1fr_2fr_auto]"><Input value={contact.name} placeholder={t("姓名")} onChange={(event) => update(index, { name: event.target.value })} /><Input value={contact.numbers.join(", ")} placeholder={t("号码，可用逗号分隔")} onChange={(event) => update(index, { numbers: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /><Button size="small" variant="danger" icon={<DeleteRegular />} onClick={() => setContacts(contacts.filter((_, item) => item !== index))} aria-label={t("删除联系人")} /></div>)}</div></section>; }

function VoicemailEditor({ config, onSave }: { config: Config; onSave: (value: Config["voicemail"]) => void }) { const { t } = useI18n(); const [value, setValue] = useState(config.voicemail); return <section className={cardClass}><h2 className="mb-4 font-semibold">{t("语音信箱")}</h2><div className="grid gap-4 md:grid-cols-3"><Field label={t("启用") }><Switch checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} /></Field><Field label={t("最长时长（秒）")}><Input type="number" value={value.maxSeconds} onChange={(event) => setValue({ ...value, maxSeconds: Number(event.target.value) })} /></Field><Field label={t("静音结束（秒）")}><Input type="number" value={value.silenceSeconds} onChange={(event) => setValue({ ...value, silenceSeconds: Number(event.target.value) })} /></Field></div><div className="mt-4"><Button variant="primary" icon={<SaveRegular />} onClick={() => onSave(value)}>{t("保存")}</Button></div></section>; }

function RecordingEditor({ config, onSave }: { config: Config; onSave: (value: Config["recording"]) => void }) { const { t } = useI18n(); const [value, setValue] = useState(config.recording); return <section className={cardClass}><h2 className="mb-4 font-semibold">{t("通话录音")}</h2><div className="grid gap-4 md:grid-cols-4"><Field label={t("启用") }><Switch checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} /></Field><Field label={t("录音方向")}><select className={fieldClass} value={value.direction} onChange={(event) => setValue({ ...value, direction: event.target.value })}><option value="all">{t("全部")}</option><option value="incoming">{t("来电")}</option><option value="outgoing">{t("去电")}</option></select></Field><Field label={t("单通最长时长（秒）")}><Input type="number" value={value.maxSeconds} onChange={(event) => setValue({ ...value, maxSeconds: Number(event.target.value) })} /></Field><Field label={t("保留天数")}><Input type="number" value={value.retentionDays} onChange={(event) => setValue({ ...value, retentionDays: Number(event.target.value) })} /></Field></div><p className="mt-3 text-xs text-gray-500">{t("录音是否启用由你所在地区的法律和通话双方同意决定。")}</p><div className="mt-4"><Button variant="primary" icon={<SaveRegular />} onClick={() => onSave(value)}>{t("保存")}</Button></div></section>; }

function SIPEditor({ config, devices, onSave }: { config: Config; devices: Device[]; onSave: (value: Config["sip"]) => void }) { const { t } = useI18n(); const [value, setValue] = useState(config.sip); return <section className={cardClass}><h2 className="mb-4 font-semibold">SIP</h2><div className="grid gap-4 md:grid-cols-3"><Field label={t("启用") }><Switch checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} /></Field><Field label={t("用户名")}><Input value={value.username} onChange={(event) => setValue({ ...value, username: event.target.value })} /></Field><Field label={t("密码")}><Input type="password" value={value.password || ""} placeholder="********" onChange={(event) => setValue({ ...value, password: event.target.value })} /></Field><Field label={t("监听地址")}><Input value={value.listenAddress} onChange={(event) => setValue({ ...value, listenAddress: event.target.value })} /></Field><Field label={t("承载设备")}><select className={fieldClass} value={value.deviceId} onChange={(event) => setValue({ ...value, deviceId: event.target.value })}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name || device.id}</option>)}</select></Field><Field label={t("允许来源（每行一个 CIDR）")}><Textarea rows={2} value={(value.allowedSources || []).join("\n")} onChange={(event) => setValue({ ...value, allowedSources: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></Field></div><div className="mt-4"><Button variant="primary" icon={<SaveRegular />} onClick={() => onSave(value)}>{t("保存")}</Button></div></section>; }

function KeepaliveEditor({ config, devices, onSave }: { config: Config; devices: Device[]; onSave: (value: Config["keepalive"]) => void }) { const { t } = useI18n(); const [tasks, setTasks] = useState(config.keepalive || []); const add = () => setTasks([...tasks, { id: `keepalive-${Date.now()}`, name: t("新保号任务"), enabled: true, deviceId: devices[0]?.id || "", kind: "call" as const, target: "", intervalHours: 24, durationSeconds: 20 }]); const update = (index: number, patch: Partial<Config["keepalive"][number]>) => setTasks(tasks.map((item, row) => row === index ? { ...item, ...patch } : item)); return <section className={cardClass}><div className="mb-4 flex justify-between"><h2 className="font-semibold">{t("保号任务")}</h2><div className="flex gap-2"><Button size="small" icon={<AddRegular />} onClick={add}>{t("新增任务")}</Button><Button size="small" variant="primary" icon={<SaveRegular />} onClick={() => onSave(tasks)}>{t("保存")}</Button></div></div><div className="space-y-2">{tasks.map((task, index) => <div key={task.id} className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-white/10 md:grid-cols-[1.2fr_1fr_1fr_1.2fr_1.2fr_auto]"><Input value={task.name} placeholder={t("任务名称")} onChange={(event) => update(index, { name: event.target.value })} /><select className={fieldClass} value={task.deviceId} onChange={(event) => update(index, { deviceId: event.target.value })}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name || device.id}</option>)}</select><select className={fieldClass} value={task.kind} onChange={(event) => update(index, { kind: event.target.value as "call" | "sms" })}><option value="call">{t("呼叫")}</option><option value="sms">{t("短信")}</option></select><Input value={task.target} placeholder={t("目标号码")} onChange={(event) => update(index, { target: event.target.value })} />{task.kind === "sms" ? <Input value={task.message || ""} placeholder={t("短信内容")} onChange={(event) => update(index, { message: event.target.value })} /> : <Input type="number" value={task.durationSeconds || 20} placeholder={t("通话秒数")} onChange={(event) => update(index, { durationSeconds: Number(event.target.value) })} />}<Input type="number" value={task.intervalHours} placeholder={t("间隔小时")} onChange={(event) => update(index, { intervalHours: Number(event.target.value) })} /><Button size="small" variant="danger" icon={<DeleteRegular />} onClick={() => setTasks(tasks.filter((_, row) => row !== index))} aria-label={t("删除任务")} /></div>)}</div></section>; }
