import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowSyncRegular,
  CallRegular,
  ChatRegular,
  DeleteRegular,
  HistoryRegular,
  PlayRegular,
  PlugConnectedRegular,
  SendRegular,
  WalletRegular,
  WindowConsoleRegular,
} from "@fluentui/react-icons";
import { api, apiMessage, camelize, eventStreamURL } from "../api";
import {
  Button,
  Input,
  PageHeader,
  Select,
  StatusDot,
  Tag,
  Textarea,
  confirmDialog,
  message,
} from "../components/ui";
import { buildDangerousCommand, COMMAND_EVENT_PAGE_SIZE, mergeCommandEvents, PASSIVE_COMMAND_EVENT_LIMIT, retainLatestCommandEvents } from "../lib/commandCenter";
import { tf, useI18n } from "../lib/i18n";
import { cx, formatDateTime } from "../lib/utils";
import type { BalanceQuery, CommandDefinition, CommandEvent, DevicesResponse, DeviceListItem } from "../types";

type DangerousAction = "switch" | "vocall" | "cellcall" | "rotate";

interface DangerousForm {
  action: DangerousAction;
  target: string;
  phone: string;
  duration: number;
}

const DANGEROUS_ACTIONS: DangerousAction[] = ["switch", "vocall", "cellcall", "rotate"];

function eventTone(kind: string): "success" | "danger" | "warning" | "info" | "primary" {
  switch (kind) {
    case "accepted":
      return "primary";
    case "progress":
      return "warning";
    case "result":
      return "success";
    case "error":
      return "danger";
    default:
      return "info";
  }
}

function eventKindLabel(kind: string) {
  switch (kind) {
    case "accepted":
      return "已接受";
    case "progress":
      return "执行中";
    case "result":
      return "结果";
    case "error":
      return "错误";
    default:
      return kind || "事件";
  }
}

function balanceTone(state: string): "success" | "danger" | "warning" | "info" {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
    case "timed_out":
      return "danger";
    case "sending":
    case "awaiting_reply":
      return "warning";
    default:
      return "info";
  }
}

function balanceStateLabel(state: string) {
  switch (state) {
    case "sending":
      return "发送中";
    case "awaiting_reply":
      return "等待回复";
    case "completed":
      return "已完成";
    case "timed_out":
      return "已超时";
    case "failed":
      return "失败";
    default:
      return state || "未知";
  }
}

function parseCommandName(input: string) {
  const first = input.trim().split(/\s+/, 1)[0] || "";
  if (!first.startsWith("/")) return "";
  return first.slice(1).toLowerCase();
}

function targetDeviceFromInput(input: string, definitions: CommandDefinition[]) {
  const name = parseCommandName(input);
  if (!name) return undefined;
  const definition = definitions.find((item) => item.name.toLowerCase() === name);
  if (!definition) return undefined;
  if (!definition.deviceArgument) return null;
  const parts = input.trim().split(/\s+/);
  return parts[1] || undefined;
}

function commandTemplate(definition: CommandDefinition, selectedDevice: string) {
  if (!definition.deviceArgument) return `/${definition.name}`;
  const device = selectedDevice.trim();
  return device ? `/${definition.name} ${device} ` : `/${definition.name} `;
}

function commandSuggestions(input: string, definitions: CommandDefinition[]) {
  const normalized = input.trimStart().toLowerCase();
  if (!normalized.startsWith("/") || normalized.includes(" ")) return [];
  const prefix = normalized.slice(1);
  return definitions
    .filter((definition) => definition.name.toLowerCase().startsWith(prefix))
    .slice(0, 8);
}

function deviceLabel(device: DeviceListItem) {
  return device.name && device.name !== device.id ? `${device.name} (${device.id})` : device.id;
}

function commandActionLabel(action: DangerousAction) {
  switch (action) {
    case "switch":
      return "切换 eSIM";
    case "vocall":
      return "VoWiFi 通话";
    case "cellcall":
      return "蜂窝通话";
    case "rotate":
      return "切换公网 IP";
  }
}

function commandEventsPath(params: { afterId?: number; beforeId?: number; limit?: number }) {
  const search = new URLSearchParams();
  if (params.afterId !== undefined) search.set("after_id", String(params.afterId));
  if (params.beforeId !== undefined) search.set("before_id", String(params.beforeId));
  search.set("limit", String(params.limit || COMMAND_EVENT_PAGE_SIZE));
  return `/command-center/events?${search.toString()}`;
}

function balanceText(query: BalanceQuery) {
  if (query.summary) return query.summary;
  if (query.amount) return [query.amount, query.currency].filter(Boolean).join(" ");
  return query.rawResponse || query.error || "--";
}

export default function CommandsPage() {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<CommandDefinition[]>([]);
  const [events, setEvents] = useState<CommandEvent[]>([]);
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [balances, setBalances] = useState<BalanceQuery[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [queryingBalance, setQueryingBalance] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [dangerForm, setDangerForm] = useState<DangerousForm>({
    action: "switch",
    target: "",
    phone: "",
    duration: 15,
  });

  const esRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<CommandEvent[]>([]);
  const definitionsRef = useRef<CommandDefinition[]>([]);
  const retainedEventLimitRef = useRef(PASSIVE_COMMAND_EVENT_LIMIT);
  const disposedRef = useRef(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    definitionsRef.current = definitions;
  }, [definitions]);

  const deviceOptions = useMemo(
    () => devices.map((device) => ({ value: device.id, label: deviceLabel(device) })),
    [devices],
  );

  const dangerousDefinitions = useMemo(
    () => definitions.filter((definition) => definition.dangerous && DANGEROUS_ACTIONS.includes(definition.name as DangerousAction)),
    [definitions],
  );

  const dangerOptions = useMemo(
    () => (dangerousDefinitions.length > 0 ? dangerousDefinitions.map((definition) => definition.name as DangerousAction) : DANGEROUS_ACTIONS)
      .map((action) => ({ value: action, label: t(commandActionLabel(action)) })),
    [dangerousDefinitions, t],
  );

  const suggestions = useMemo(() => commandSuggestions(input, definitions), [input, definitions]);

  const executionInputs = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.kind === "accepted" && event.executionId) map.set(event.executionId, event.text);
    }
    return map;
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (!selectedDevice) return events;
    return events.filter((event) => {
      const sourceInput = event.kind === "accepted" ? event.text : executionInputs.get(event.executionId) || "";
      const target = targetDeviceFromInput(sourceInput, definitions);
      return target === null || target === undefined || target === selectedDevice;
    });
  }, [definitions, events, executionInputs, selectedDevice]);

  const visibleBalances = useMemo(
    () => balances.filter((query) => !selectedDevice || query.deviceId === selectedDevice),
    [balances, selectedDevice],
  );

  const selectedDeviceName = useMemo(
    () => devices.find((device) => device.id === selectedDevice)?.name || selectedDevice,
    [devices, selectedDevice],
  );

  const mergeLiveEvents = useCallback((incoming: CommandEvent[]) => {
    if (incoming.length === 0 || disposedRef.current) return;
    const merged = mergeCommandEvents(eventsRef.current, incoming);
    const retained = retainLatestCommandEvents(merged, retainedEventLimitRef.current);
    eventsRef.current = retained.events;
    setEvents(retained.events);
    if (retained.dropped) setHasOlder(true);
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await api<CommandDefinition[]>("/command-center/commands");
    if (disposedRef.current) return data;
    setDefinitions(data);
    return data;
  }, []);

  const loadDevices = useCallback(async () => {
    const data = await api<DevicesResponse>("/devices");
    const list = data.devices || [];
    if (disposedRef.current) return list;
    setDevices(list);
    setSelectedDevice((current) => list.some((device) => device.id === current) ? current : list[0]?.id || "");
    return list;
  }, []);

  const loadBalances = useCallback(async () => {
    const data = await api<BalanceQuery[]>("/balances?limit=50");
    if (!disposedRef.current) setBalances(data || []);
    return data || [];
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const latestBeforeRequest = eventsRef.current.at(-1)?.id || 0;
      const data = await api<CommandEvent[]>(commandEventsPath({ beforeId: 0, limit: COMMAND_EVENT_PAGE_SIZE }));
      if (disposedRef.current) return null;
      const liveEvents = eventsRef.current.filter((event) => event.id > latestBeforeRequest);
      const next = mergeCommandEvents(data || [], liveEvents);
      retainedEventLimitRef.current = PASSIVE_COMMAND_EVENT_LIMIT;
      eventsRef.current = next;
      setEvents(next);
      setHasOlder((data || []).length === COMMAND_EVENT_PAGE_SIZE);
      setHistoryError("");
      return next;
    } catch (error) {
      const detail = apiMessage(error);
      if (!disposedRef.current) {
        setHistoryError(detail);
        message.error(detail);
      }
      return null;
    }
  }, []);

  const connectStream = useCallback((afterID: number) => {
    esRef.current?.close();
    const params = new URLSearchParams({ after_id: String(afterID) });
    const es = new EventSource(eventStreamURL("/command-center/stream", params));
    esRef.current = es;
    setStreamStarted(true);

    es.onopen = () => {
      if (disposedRef.current) return;
      setStreamConnected(true);
      setStreamError("");
    };
    es.onerror = () => {
      if (disposedRef.current) return;
      setStreamConnected(false);
      setStreamError(t("连接中断，浏览器正在自动重连…"));
    };
    const handle = (event: MessageEvent<string>) => {
      try {
        mergeLiveEvents([camelize<CommandEvent>(JSON.parse(event.data))]);
      } catch {
        // 忽略无法解析的 SSE 帧，避免中断后续事件。
      }
    };
    es.addEventListener("command", handle);
  }, [mergeLiveEvents, t]);

  useEffect(() => {
    disposedRef.current = false;
    void (async () => {
      setLoading(true);
      const [loadedEvents] = await Promise.all([
        loadEvents(),
        loadCatalog().catch((error) => {
          message.error(apiMessage(error));
          return null;
        }),
        loadDevices().catch((error) => {
          message.error(apiMessage(error));
          return null;
        }),
        loadBalances().catch(() => []),
      ]);
      if (!disposedRef.current && loadedEvents) connectStream(loadedEvents.at(-1)?.id || 0);
      if (!disposedRef.current) setLoading(false);
    })();
    return () => {
      disposedRef.current = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connectStream, loadBalances, loadCatalog, loadDevices, loadEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBalances().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadBalances]);

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [loadedEvents] = await Promise.all([loadEvents(), loadCatalog(), loadDevices(), loadBalances()]);
      if (loadedEvents) connectStream(loadedEvents.at(-1)?.id || 0);
      message.success(t("命令中心已刷新"));
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadOlder() {
    const firstID = eventsRef.current[0]?.id;
    if (!firstID || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await api<CommandEvent[]>(commandEventsPath({ beforeId: firstID, limit: COMMAND_EVENT_PAGE_SIZE }));
      const merged = mergeCommandEvents(older || [], eventsRef.current);
      retainedEventLimitRef.current = Math.max(retainedEventLimitRef.current, merged.length);
      eventsRef.current = merged;
      setEvents(merged);
      setHasOlder((older || []).length === COMMAND_EVENT_PAGE_SIZE);
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function clearHistory() {
    const confirmed = await confirmDialog(
      t("只清除已完成和失败的记录，进行中的命令会保留。"),
      t("清除命令历史"),
      { type: "warning", confirmText: t("清除"), cancelText: t("取消") },
    );
    if (!confirmed) return;
    try {
      const result = await api<{ cleared: number }>("/command-center/history", { method: "DELETE" });
      await loadEvents();
      message.success(tf("已清除 {count} 条执行记录", { count: result.cleared || 0 }));
    } catch (error) {
      message.error(apiMessage(error));
    }
  }

  async function executeCommand(command: string, options: { skipDangerConfirm?: boolean } = {}) {
    const value = command.trim();
    if (!value || executing) return;
    const definition = definitionsRef.current.find((item) => item.name === parseCommandName(value));
    if (definition?.dangerous && !options.skipDangerConfirm) {
      const confirmed = await confirmDialog(
        value,
        t("确认执行高风险命令"),
        { type: "warning", confirmText: t("执行"), cancelText: t("取消") },
      );
      if (!confirmed) return;
    }
    setExecuting(true);
    try {
      const latest = eventsRef.current.at(-1)?.id || 0;
      await api("/command-center/executions", { method: "POST", body: { input: value } });
      setInput("");
      const catchup = await api<CommandEvent[]>(commandEventsPath({ afterId: latest, limit: 50 }));
      mergeLiveEvents(catchup || []);
      if (parseCommandName(value) === "balance") {
        await loadBalances();
      }
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setExecuting(false);
    }
  }

  async function executeDangerousShortcut() {
    if (!selectedDevice) {
      message.warning(t("请选择设备"));
      return;
    }
    let command = "";
    try {
      command = buildDangerousCommand({
        name: dangerForm.action,
        device: selectedDevice,
        target: dangerForm.target,
        phone: dangerForm.phone,
        duration: dangerForm.duration,
      });
    } catch (error) {
      message.warning(error instanceof Error ? error.message : t("快捷动作参数无效"));
      return;
    }
    const confirmed = await confirmDialog(
      command,
      t("确认执行高风险命令"),
      { type: "warning", confirmText: t("执行"), cancelText: t("取消") },
    );
    if (!confirmed) return;
    await executeCommand(command, { skipDangerConfirm: true });
  }

  async function startBalanceQuery() {
    if (!selectedDevice || queryingBalance) {
      if (!selectedDevice) message.warning(t("请选择设备"));
      return;
    }
    setQueryingBalance(true);
    try {
      const query = await api<BalanceQuery>(`/devices/${encodeURIComponent(selectedDevice)}/balance-queries`, { method: "POST" });
      setBalances((current) => [query, ...current.filter((item) => item.id !== query.id)].slice(0, 50));
      message.success(query.state === "completed" ? t("运营商已返回结果") : t("查询已发送，正在等待运营商回复"));
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setQueryingBalance(false);
    }
  }

  function submitInput() {
    void executeCommand(input);
  }

  function handleInputKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    submitInput();
  }

  const streamLabel = streamConnected
    ? t("实时连接")
    : streamStarted
      ? t("正在重连")
      : t("实时连接已暂停");
  const syncWarning = [historyError ? `${t("命令历史")}：${historyError}` : "", streamError].filter(Boolean).join("；");

  return (
    <div className="commands-page mx-auto w-full max-w-[1500px]">
      <PageHeader
        title={t("命令中心")}
        actions={
          <Button loading={refreshing} onClick={() => void refreshAll()} icon={<ArrowSyncRegular />}>
            {t("刷新")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="ui-card flex min-h-[680px] min-w-0 flex-col overflow-hidden">
          <header className="border-b border-gray-100 p-4 dark:border-white/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                  <ChatRegular className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("vofly 命令会话")}</h2>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      <StatusDot tone={streamConnected ? "success" : "warning"} />
                      <PlugConnectedRegular className="h-4 w-4" />
                      {streamLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {selectedDevice ? tf("当前设备：{device}", { device: selectedDeviceName }) : t("全部设备")}
                    {" · "}
                    {tf("{count} 条命令事件", { count: visibleEvents.length })}
                    {" · "}
                    {tf("{count} 条余额记录", { count: visibleBalances.length })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasOlder ? (
                  <Button loading={loadingOlder} onClick={() => void loadOlder()} icon={<HistoryRegular />}>
                    {t("更早记录")}
                  </Button>
                ) : null}
                <Button onClick={() => void clearHistory()} icon={<DeleteRegular />}>
                  {t("清除历史")}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("目标设备")}</span>
                <Select
                  value={selectedDevice}
                  onChange={setSelectedDevice}
                  options={deviceOptions}
                  placeholder={t("选择设备")}
                />
              </label>
              {syncWarning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  {syncWarning}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
                  {t("命令会在后端串行写入事件，页面通过 SSE 自动追踪结果。")}
                </div>
              )}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto bg-gray-950 p-4 font-mono text-sm text-gray-100 dark:bg-black">
            {loading ? (
              <div className="py-10 text-center text-gray-500">{t("加载中...")}</div>
            ) : visibleEvents.length === 0 ? (
              <div className="py-10 text-center text-gray-500">{t("暂无命令事件")}</div>
            ) : (
              <div className="space-y-2">
                {visibleEvents.map((event) => (
                  <article key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <Tag type={eventTone(event.kind)}>{t(eventKindLabel(event.kind))}</Tag>
                      <span>#{event.id}</span>
                      {event.executionId ? <span className="truncate">exec:{event.executionId}</span> : null}
                      <span className="ml-auto">{formatDateTime(event.createdAt)}</span>
                    </div>
                    <pre className={cx(
                      "mt-2 whitespace-pre-wrap break-words leading-6",
                      event.kind === "error" ? "text-red-200" : event.kind === "accepted" ? "text-sky-200" : "text-gray-100",
                    )}>
                      {event.text || "--"}
                    </pre>
                    {event.attachments?.length ? (
                      <div className="mt-2 space-y-1 text-xs text-gray-400">
                        {event.attachments.map((attachment, index) => {
                          const caption = `${attachment.type} · ${attachment.recording || attachment.contentType || attachment.codec || "--"}`;
                          // 带通话 ID 的音频附件直接挂到录音接口在线播放；其余保持文本行。
                          if (attachment.type === "audio" && attachment.callId) {
                            return (
                              <div key={`${attachment.type}-${index}`} className="space-y-1">
                                <audio
                                  controls
                                  preload="none"
                                  className="h-8 w-full"
                                  src={`/api/call-recordings/${encodeURIComponent(attachment.callId)}`}
                                />
                                <div>{caption}</div>
                              </div>
                            );
                          }
                          return <div key={`${attachment.type}-${index}`}>{caption}</div>;
                        })}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </main>

          <footer className="border-t border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-[#141418]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitInput();
              }}
              className="space-y-3"
            >
              <Textarea
                value={input}
                rows={3}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKey}
                placeholder={t("输入 /help、/status 或 /balance；Enter 执行，Shift+Enter 换行")}
                disabled={executing}
              />
              {suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((definition) => (
                    <button
                      key={definition.name}
                      type="button"
                      onClick={() => setInput(commandTemplate(definition, selectedDevice))}
                      className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                    >
                      /{definition.name}
                      <span className="ml-1 text-gray-400">{definition.summary}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-400">
                  {t("快捷键：Enter 或 Ctrl+Enter 执行；Shift+Enter 换行。高风险命令会二次确认。")}
                </div>
                <Button type="submit" variant="primary" loading={executing} disabled={!input.trim()} icon={<SendRegular />}>
                  {t("执行")}
                </Button>
              </div>
            </form>
          </footer>
        </section>

        <aside className="space-y-4">
          <section className="ui-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WalletRegular className="h-5 w-5 text-emerald-500" />
                <h3 className="font-bold text-gray-900 dark:text-gray-100">{t("余额查询")}</h3>
              </div>
              <Button size="small" loading={queryingBalance} disabled={!selectedDevice} onClick={() => void startBalanceQuery()}>
                {t("查询")}
              </Button>
            </div>
            <p className="mb-3 text-xs text-gray-400">{t("使用当前设备的运营商规则发送 USSD 或短信查询，结果会写入余额历史。")}</p>
            <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
              {visibleBalances.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
                  {t("暂无余额记录")}
                </div>
              ) : visibleBalances.map((query) => (
                <div key={query.id} className="rounded-xl border border-gray-100 p-3 text-sm dark:border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-800 dark:text-gray-200">{balanceText(query)}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        {query.deviceId}
                        {query.iccid ? ` · …${query.iccid.slice(-6)}` : ""}
                        {` · ${formatDateTime(query.updatedAt)}`}
                      </div>
                    </div>
                    <Tag type={balanceTone(query.state)}>{t(balanceStateLabel(query.state))}</Tag>
                  </div>
                  {query.error ? <div className="mt-2 text-xs text-red-500">{query.error}</div> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="ui-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <PlayRegular className="h-5 w-5 text-amber-500" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">{t("高风险快捷动作")}</h3>
            </div>
            <div className="space-y-3">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("动作")}</span>
                <Select
                  value={dangerForm.action}
                  onChange={(value) => setDangerForm((current) => ({ ...current, action: value as DangerousAction }))}
                  options={dangerOptions}
                />
              </label>
              {dangerForm.action === "switch" ? (
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("Profile 序号或 ICCID")}</span>
                  <Input value={dangerForm.target} onChange={(event) => setDangerForm((current) => ({ ...current, target: event.target.value }))} />
                </label>
              ) : null}
              {dangerForm.action === "vocall" || dangerForm.action === "cellcall" ? (
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("电话号码")}</span>
                    <Input value={dangerForm.phone} onChange={(event) => setDangerForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+12025550123" />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("秒数")}</span>
                    <Input type="number" min={1} max={600} value={dangerForm.duration} onChange={(event) => setDangerForm((current) => ({ ...current, duration: Number(event.target.value) }))} />
                  </label>
                </div>
              ) : null}
              <Button
                block
                variant="warning"
                plain
                disabled={!selectedDevice}
                onClick={() => void executeDangerousShortcut()}
                icon={<CallRegular />}
              >
                {t("检查并执行")}
              </Button>
              <p className="text-xs text-gray-400">{t("快捷动作会生成 slash 命令并弹出确认框，实际执行仍走命令中心后端。")}</p>
            </div>
          </section>

          <section className="ui-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <WindowConsoleRegular className="h-5 w-5 text-indigo-500" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">{t("命令目录")}</h3>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {definitions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
                  {t("暂无命令定义")}
                </div>
              ) : definitions.map((definition) => (
                <button
                  key={definition.name}
                  type="button"
                  onClick={() => setInput(commandTemplate(definition, selectedDevice))}
                  className="w-full rounded-xl border border-gray-100 p-3 text-left transition-colors hover:border-sky-200 hover:bg-sky-50/70 dark:border-white/10 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-300">{definition.usage}</span>
                    <div className="flex gap-1">
                      {definition.dangerous ? <Tag type="warning">{t("高风险")}</Tag> : null}
                      {definition.async ? <Tag type="info">{t("异步")}</Tag> : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{definition.summary}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
