import { useCallback, useEffect, useMemo, useState } from "react";
import { LinkRegular, SaveRegular, WalletRegular } from "@fluentui/react-icons";
import { useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api";
import { Button, EmptyState, Input, PageHeader, Switch, Tabs, Tag, message } from "../components/ui";
import { tf, useI18n } from "../lib/i18n";
import {
  buildCardContextKey,
  formatCardContextTitle,
  planKindLabel,
  queryCenterBalancePlansPath,
  queryCenterBalanceQueriesPath,
  queryCenterCardResourcePath,
  type CardContext,
} from "../lib/queryCenter";
import { cx, formatDateTime } from "../lib/utils";
import type {
  BalancePlan,
  BalanceQuery,
  CardResourceResponse,
  DevicesResponse,
  DeviceListItem,
  EsimOverview,
} from "../types";

type DetailTab = "balance" | "renewal";

interface ResourceForm {
  rechargeUrl: string;
  renewUrl: string;
}

function deviceLabel(device: DeviceListItem) {
  return device.name && device.name !== device.id ? `${device.name} (${device.id})` : device.id;
}

function cardMeta(card: CardContext) {
  const tail = card.iccid ? card.iccid.slice(-6) : "--";
  return card.kind === "physical" ? `实体 SIM · ${tail}` : `Profile · ${tail}`;
}

function balanceText(query: BalanceQuery) {
  if (query.summary) return query.summary;
  if (query.amount) return [query.amount, query.currency].filter(Boolean).join(" ");
  return query.rawResponse || query.error || "--";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function QueryCenterPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [profilesByDevice, setProfilesByDevice] = useState<Record<string, EsimOverview["profiles"]>>({});
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingResource, setSavingResource] = useState(false);
  const [queryingBalance, setQueryingBalance] = useState(false);
  const [resource, setResource] = useState<CardResourceResponse | null>(null);
  const [resourceForm, setResourceForm] = useState<ResourceForm>({ rechargeUrl: "", renewUrl: "" });
  const [balances, setBalances] = useState<BalanceQuery[]>([]);
  const [plans, setPlans] = useState<BalancePlan[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("balance");

  const contexts = useMemo<CardContext[]>(() => {
    const rows: CardContext[] = [];
    for (const device of devices) {
      const iccid = (device.modem?.iccid || "").trim();
      if (iccid) {
        rows.push({
          deviceId: device.id,
          deviceName: deviceLabel(device),
          iccid,
          profileAid: "",
          profileName: "实体 SIM",
          carrierName: device.modem?.operator || "",
          kind: "physical",
        });
      }
      for (const group of profilesByDevice[device.id] || []) {
        for (const profile of group.profiles || []) {
          rows.push({
            deviceId: device.id,
            deviceName: deviceLabel(device),
            iccid: profile.iccid,
            profileAid: group.aidHex || "",
            profileName: profile.name || profile.serviceProviderName || "eSIM Profile",
            carrierName: profile.serviceProviderName || "",
            kind: "profile",
          });
        }
      }
    }
    return rows;
  }, [devices, profilesByDevice]);

  const selectedCard = useMemo(
    () => contexts.find((card) => buildCardContextKey(card) === selectedKey) || null,
    [contexts, selectedKey],
  );

  const loadCardDetail = useCallback(async (card: CardContext) => {
    setDetailLoading(true);
    try {
      const [cardResource, balanceList, planList] = await Promise.all([
        api<CardResourceResponse>(queryCenterCardResourcePath(card.iccid, card.profileAid)),
        api<BalanceQuery[]>(queryCenterBalanceQueriesPath(card.iccid, card.profileAid)),
        api<BalancePlan[]>(queryCenterBalancePlansPath(card.iccid, card.profileAid)),
      ]);
      setResource(cardResource);
      setResourceForm({
        rechargeUrl: cardResource.effective?.rechargeUrl || "",
        renewUrl: cardResource.effective?.renewUrl || "",
      });
      setBalances(balanceList || []);
      setPlans(planList || []);
    } catch (error) {
      message.error(apiMessage(error));
      setResource(null);
      setBalances([]);
      setPlans([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const data = await api<DevicesResponse>("/devices");
        if (!active) return;
        const list = data.devices || [];
        setDevices(list);
        const entries = await Promise.all(list.map(async (device) => {
          try {
            const overview = await api<EsimOverview>(`/devices/${encodeURIComponent(device.id)}/esim`);
            return [device.id, overview.profiles || []] as const;
          } catch {
            return [device.id, []] as const;
          }
        }));
        if (active) setProfilesByDevice(Object.fromEntries(entries));
      } catch (error) {
        if (active) message.error(apiMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const deviceID = params.get("device_id") || "";
    const iccid = params.get("iccid") || "";
    const profileAid = params.get("profile_aid") || "";
    if (!deviceID || !iccid) {
      setSelectedKey("");
      return;
    }
    setSelectedKey(buildCardContextKey({ deviceId: deviceID, iccid, profileAid }));
  }, [params]);

  useEffect(() => {
    if (selectedCard) void loadCardDetail(selectedCard);
    else {
      setResource(null);
      setBalances([]);
      setPlans([]);
      setResourceForm({ rechargeUrl: "", renewUrl: "" });
    }
  }, [loadCardDetail, selectedCard]);

  function chooseCard(card: CardContext) {
    const next = new URLSearchParams();
    next.set("device_id", card.deviceId);
    next.set("iccid", card.iccid);
    if (card.profileAid) next.set("profile_aid", card.profileAid);
    setParams(next);
  }

  async function startBalanceQuery() {
    if (!selectedCard || queryingBalance) return;
    setQueryingBalance(true);
    try {
      const query = await api<BalanceQuery>("/query-center/balance-queries", {
        method: "POST",
        body: {
          deviceId: selectedCard.deviceId,
          iccid: selectedCard.iccid,
          profileAid: selectedCard.profileAid || "",
        },
      });
      setBalances((current) => [query, ...current.filter((item) => item.id !== query.id)]);
      message.success(t("查询已提交"));
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setQueryingBalance(false);
    }
  }

  async function saveResource() {
    if (!selectedCard || savingResource) return;
    setSavingResource(true);
    try {
      const saved = await api<CardResourceResponse>(queryCenterCardResourcePath(selectedCard.iccid, selectedCard.profileAid), {
        method: "PUT",
        body: {
          profileName: selectedCard.profileName || "",
          carrierSpn: selectedCard.carrierName || "",
          rechargeUrl: resourceForm.rechargeUrl,
          renewUrl: resourceForm.renewUrl,
          knowledgeLinks: resource?.effective?.knowledgeLinks || [],
        },
      });
      setResource(saved);
      message.success(t("卡资料已保存"));
    } catch (error) {
      message.error(apiMessage(error));
    } finally {
      setSavingResource(false);
    }
  }

  async function addReminderPlan() {
    if (!selectedCard) return;
    try {
      const saved = await api<BalancePlan>("/query-center/balance-plans", {
        method: "POST",
        body: {
          name: "充值续费提醒",
          kind: "renewal_reminder",
          deviceId: selectedCard.deviceId,
          iccid: selectedCard.iccid,
          profileAid: selectedCard.profileAid || "",
          profileName: selectedCard.profileName || "",
          intervalDays: 30,
          startDate: today(),
          runTime: "09:00",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
          enabled: true,
          notify: true,
        },
      });
      setPlans((current) => [saved, ...current]);
      message.success(t("充值续费提醒已创建"));
    } catch (error) {
      message.error(apiMessage(error));
    }
  }

  const contextCard = (
    <section className="query-center-context-card ui-card min-h-[136px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t("当前卡片")}</div>
          <h2 className="mt-2 truncate text-lg font-bold text-gray-900 dark:text-gray-100">
            {t(formatCardContextTitle(selectedCard))}
          </h2>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
            {selectedCard ? `${selectedCard.deviceName} · ${cardMeta(selectedCard)}` : t("选择后显示余额、充值续费和卡资料")}
          </p>
        </div>
        <div className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
          selectedCard
            ? "border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
            : "border-gray-200 bg-gray-50 text-gray-400 dark:border-white/10 dark:bg-white/5",
        )}>
          <WalletRegular className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-gray-50 p-2 dark:bg-white/[0.03]">
          <div className="text-gray-400">ICCID</div>
          <div className="mt-1 truncate font-mono text-gray-700 dark:text-gray-200">{selectedCard?.iccid || "--"}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-2 dark:bg-white/[0.03]">
          <div className="text-gray-400">Profile</div>
          <div className="mt-1 truncate font-mono text-gray-700 dark:text-gray-200">{selectedCard?.profileAid || t("实体 SIM")}</div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="query-center-page mx-auto flex h-full min-h-[720px] w-full max-w-[1500px] flex-col">
      <PageHeader title={t("查询中心")} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="ui-card flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-gray-100 p-4 dark:border-white/10">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">{t("卡 / Profile")}</h2>
            <p className="mt-1 text-xs text-gray-400">{t("选择左侧卡片后，在右侧查看余额、充值续费和卡资料。")}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {loading ? <div className="py-8 text-center text-sm text-gray-400">{t("加载中...")}</div> : null}
            {!loading && contexts.length === 0 ? (
              <EmptyState title={t("暂无可用 SIM / Profile")} />
            ) : contexts.map((card) => {
              const key = buildCardContextKey(card);
              const active = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseCard(card)}
                  className={cx(
                    "w-full rounded-2xl border p-3 text-left transition-all",
                    active
                      ? "border-indigo-200 bg-indigo-50/70 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10"
                      : "border-transparent hover:bg-gray-50/70 dark:hover:bg-white/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{formatCardContextTitle(card)}</div>
                      <div className="mt-1 truncate text-xs text-gray-400">{card.deviceName}</div>
                    </div>
                    <Tag type={card.kind === "physical" ? "info" : "primary"}>{t(card.kind === "physical" ? "实体 SIM" : "Profile")}</Tag>
                  </div>
                  <div className="mt-2 truncate font-mono text-xs text-gray-400">{card.iccid}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-4">
          {contextCard}
          <section className="ui-card flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs
              className="px-4 pt-2"
              value={activeTab}
              onChange={(key) => setActiveTab(key as DetailTab)}
              tabs={[
                { key: "balance", label: t("余额") },
                { key: "renewal", label: t("充值续费") },
              ]}
            />
            {!selectedCard ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState title={t("请选择左侧的卡或 Profile")} />
              </div>
            ) : activeTab === "balance" ? (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{t("余额")}</h3>
                    <p className="mt-1 text-xs text-gray-400">{t("按所选卡/Profile 查询并展示余额历史。")}</p>
                  </div>
                  <Button loading={queryingBalance} onClick={() => void startBalanceQuery()}>
                    {t("立即查询")}
                  </Button>
                </div>
                {detailLoading ? <div className="py-8 text-center text-sm text-gray-400">{t("加载中...")}</div> : null}
                {!detailLoading && balances.length === 0 ? (
                  <EmptyState title={t("暂无余额记录")} />
                ) : (
                  <div className="space-y-2">
                    {balances.map((query) => (
                      <article key={query.id} className="rounded-2xl border border-gray-100 p-3 dark:border-white/10">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-gray-900 dark:text-gray-100">{balanceText(query)}</div>
                            <div className="mt-1 text-xs text-gray-400">{formatDateTime(query.updatedAt)}</div>
                          </div>
                          <Tag type={balanceTone(query.state)}>{t(balanceStateLabel(query.state))}</Tag>
                        </div>
                        {query.changeAmount ? (
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {tf("变化：{amount}", { amount: query.changeAmount })}
                          </div>
                        ) : null}
                        {query.error ? <div className="mt-2 text-xs text-red-500">{query.error}</div> : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="space-y-4">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">{t("充值续费")}</h3>
                      <p className="mt-1 text-xs text-gray-400">{t("维护充值、续费链接，并创建卡级提醒计划。")}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="mb-1.5 block text-xs font-bold text-gray-500">{t("充值链接")}</span>
                        <Input value={resourceForm.rechargeUrl} onChange={(event) => setResourceForm((current) => ({ ...current, rechargeUrl: event.target.value }))} placeholder="https://..." />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-xs font-bold text-gray-500">{t("续费链接")}</span>
                        <Input value={resourceForm.renewUrl} onChange={(event) => setResourceForm((current) => ({ ...current, renewUrl: event.target.value }))} placeholder="https://..." />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button loading={savingResource} onClick={() => void saveResource()} icon={<SaveRegular />}>{t("保存卡资料")}</Button>
                      <Button plain onClick={() => void addReminderPlan()}>{t("新增续费提醒")}</Button>
                      {resource?.effective?.rechargeUrl ? <Button plain icon={<LinkRegular />} onClick={() => window.open(resource.effective.rechargeUrl, "_blank", "noopener,noreferrer")}>{t("打开充值")}</Button> : null}
                      {resource?.effective?.renewUrl ? <Button plain icon={<LinkRegular />} onClick={() => window.open(resource.effective.renewUrl, "_blank", "noopener,noreferrer")}>{t("打开续费")}</Button> : null}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-gray-100 p-3 dark:border-white/10">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-bold text-gray-900 dark:text-gray-100">{t("提醒计划")}</div>
                      <Tag type="info">{plans.length}</Tag>
                    </div>
                    {plans.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-400">{t("暂无充值续费提醒")}</div>
                    ) : (
                      <div className="space-y-2">
                        {plans.map((plan) => (
                          <div key={plan.id} className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/[0.03]">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">{plan.name}</div>
                              <Switch checked={plan.enabled} disabled size="small" ariaLabel={t("启用")} />
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {t(planKindLabel(plan.kind))} · {tf("{days} 天", { days: plan.intervalDays })} · {plan.runTime}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">{tf("下次：{time}", { time: formatDateTime(plan.nextRunAt) })}</div>
                            {plan.lastError ? <div className="mt-2 text-xs text-red-500">{plan.lastError}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
