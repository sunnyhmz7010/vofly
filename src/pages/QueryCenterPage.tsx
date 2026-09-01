import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { ApiError, api } from "../api";
import { Button, EmptyState, ErrorState, PageHeader, RefreshButton, Spinner, Tabs } from "../components/ui";
import { CardContextList } from "../components/query-center/CardContextList";
import { BalancePanel } from "../components/query-center/BalancePanel";
import { CardLinksPanel } from "../components/query-center/CardLinksPanel";
import { BalancePlansPanel } from "../components/query-center/BalancePlansPanel";
import { buildCardContexts, type QueryCardContext } from "../lib/queryCenter";
import { tl, useI18n } from "../lib/i18n";
import { cx } from "../lib/utils";
import type { DeviceListItem, DevicesResponse } from "../types";
import type { EsimProfileGroup } from "../components/devices/types";

const MOBILE_BREAKPOINT = 980;

type MenuKey = "balance" | "links" | "knowledge" | "plans";

const MENUS: Array<{ key: MenuKey; label: string }> = [
  { key: "balance", label: "余额" },
  { key: "links", label: "充值/续费" },
  { key: "knowledge", label: "知识库" },
  { key: "plans", label: "计划" },
];

interface LoadError {
  message: string;
  status?: number;
}

function toLoadError(e: unknown): LoadError {
  if (e instanceof ApiError) return { message: e.message, status: e.status };
  if (e instanceof Error) return { message: e.message };
  return { message: tl("加载失败") };
}

export default function QueryCenterPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedDevice = searchParams.get("device") || "";
  const selectedIccid = searchParams.get("iccid") || "";
  const selectedAid = searchParams.get("profile_aid") || "";
  const menu = (searchParams.get("menu") as MenuKey) || "balance";

  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<LoadError | null>(null);
  const [contexts, setContexts] = useState<QueryCardContext[]>([]);
  const [contextsLoading, setContextsLoading] = useState(false);
  const [contextsError, setContextsError] = useState<LoadError | null>(null);
  const [width, setWidth] = useState(0);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const contextReqId = useRef(0);

  const isDesktop = width === 0 || width >= MOBILE_BREAKPOINT;
  // 移动端逐栏进入：设备列 → 卡上下文列 → 功能面板。
  const showDeviceColumn = isDesktop || !selectedDevice;
  const showContextColumn = isDesktop || (!!selectedDevice && !selectedIccid);
  const showDetailColumn = isDesktop || (!!selectedDevice && !!selectedIccid);

  const syncQuery = useCallback(
    (patch: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const data = await api<DevicesResponse>("/devices");
      setDevices(data.devices || []);
    } catch (error) {
      setDevicesError(toLoadError(error));
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadContexts = useCallback(
    async (deviceId: string) => {
      const id = ++contextReqId.current;
      setContextsLoading(true);
      setContextsError(null);
      try {
        const data = await api<{ profiles?: EsimProfileGroup[] }>(`/devices/${encodeURIComponent(deviceId)}/esim`);
        if (id !== contextReqId.current) return;
        const device = devices.find((item) => item.id === deviceId);
        setContexts(buildCardContexts(deviceId, device?.modem?.iccid || "", data.profiles || []));
      } catch (error) {
        if (id !== contextReqId.current) return;
        setContextsError(toLoadError(error));
        // 清单读取失败时仍以当前激活卡兜底一个实体卡上下文。
        const device = devices.find((item) => item.id === deviceId);
        setContexts(buildCardContexts(deviceId, device?.modem?.iccid || "", []));
      } finally {
        if (id === contextReqId.current) setContextsLoading(false);
      }
    },
    [devices],
  );

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (selectedDevice) void loadContexts(selectedDevice);
    else setContexts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice]);

  useEffect(() => {
    const measure = () => setWidth(pageRef.current?.clientWidth || 0);
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && pageRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(pageRef.current);
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const selectedCard = useMemo(
    () => contexts.find((c) => c.iccid === selectedIccid && (c.profileAid || "") === selectedAid) || null,
    [contexts, selectedIccid, selectedAid],
  );

  function selectDevice(id: string) {
    syncQuery({ device: id, iccid: "", profile_aid: "" });
  }

  function selectCard(card: QueryCardContext) {
    syncQuery({ device: selectedDevice, iccid: card.iccid, profile_aid: card.profileAid });
  }

  const device = devices.find((item) => item.id === selectedDevice) || null;

  return (
    <div ref={pageRef} className="flex h-[calc(100vh-140px)] flex-col">
      <PageHeader
        title={t("查询中心")}
        actions={
          <RefreshButton
            loading={devicesLoading || contextsLoading}
            onClick={() => {
              void loadDevices();
              if (selectedDevice) void loadContexts(selectedDevice);
            }}
          />
        }
      />
      {devicesError ? (
        <ErrorState
          className="mb-4"
          title={t("设备列表加载失败")}
          message={devicesError.message}
          statusCode={devicesError.status}
          retryText={t("重试")}
          onRetry={() => void loadDevices()}
        />
      ) : null}
      <div className="relative flex-1 overflow-hidden ui-card">
        {devicesLoading && devices.length === 0 ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-black/20">
            <Spinner className="h-7 w-7 text-[#0ea5e9]" />
          </div>
        ) : null}
        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[240px_300px_minmax(0,1fr)]">
          {showDeviceColumn ? (
            <div
              className={cx(
                "flex min-h-0 flex-col",
                isDesktop && "border-r border-gray-100 dark:border-white/10",
              )}
            >
              <div className="border-b border-gray-100 p-4 dark:border-white/10">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("设备")}</div>
              </div>
              <div className="space-y-1 overflow-auto p-3">
                {devices.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectDevice(item.id)}
                    className={cx(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                      selectedDevice === item.id
                        ? "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                        : "border-transparent hover:bg-gray-50/60 dark:hover:bg-white/5",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">
                        {item.name || item.id}
                      </div>
                      <div className="truncate text-xs text-gray-400">{item.id}</div>
                    </div>
                    <span
                      className={cx(
                        "h-2 w-2 shrink-0 rounded-full",
                        !!item.running && (item.controlOnline ?? item.healthy) ? "bg-green-500" : "bg-red-500",
                      )}
                    />
                  </button>
                ))}
                {!devicesLoading && devices.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">{t("暂无设备")}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {showContextColumn ? (
            <div
              className={cx(
                "flex min-h-0 flex-col",
                isDesktop && "border-r border-gray-100 dark:border-white/10",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-4 dark:border-white/10">
                {!isDesktop ? (
                  <Button size="small" variant="text" icon={<ArrowLeftRegular />} onClick={() => syncQuery({ device: "" })}>
                    {t("返回")}
                  </Button>
                ) : null}
                <div className="truncate text-xs font-bold uppercase tracking-wider text-gray-500">{t("卡与 Profile")}</div>
              </div>
              {contextsError && contexts.length === 0 ? (
                <div className="p-4 text-sm text-amber-600 dark:text-amber-400">
                  {t("eSIM 清单读取失败，已按当前激活卡展示")}
                </div>
              ) : null}
              <CardContextList
                contexts={contexts}
                loading={contextsLoading}
                selectedKey={`${selectedIccid}@${selectedAid}`}
                onSelect={selectCard}
              />
            </div>
          ) : null}

          {showDetailColumn ? (
            <div className="flex min-h-0 flex-col">
              {selectedCard && device ? (
                <>
                  <div className="border-b border-gray-100 p-4 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      {!isDesktop ? (
                        <Button
                          size="small"
                          variant="text"
                          icon={<ArrowLeftRegular />}
                          onClick={() => syncQuery({ iccid: "", profile_aid: "" })}
                        >
                          {t("返回")}
                        </Button>
                      ) : null}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">
                          {selectedCard.label || selectedIccid}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {selectedIccid}
                          {selectedCard.active ? ` · ${t("当前激活")}` : ""}
                        </div>
                      </div>
                    </div>
                    <Tabs
                      className="mt-3"
                      value={menu}
                      onChange={(key) => syncQuery({ menu: key })}
                      tabs={MENUS.map((item) => ({ key: item.key, label: t(item.label) }))}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    {menu === "balance" ? (
                      <BalancePanel
                        deviceId={device.id}
                        card={selectedCard}
                        onOpenPlans={() => syncQuery({ menu: "plans" })}
                      />
                    ) : menu === "plans" ? (
                      <BalancePlansPanel deviceId={device.id} card={selectedCard} />
                    ) : (
                      <CardLinksPanel
                        deviceId={device.id}
                        card={selectedCard}
                        section={menu === "links" ? "recharge" : "knowledge"}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="border-b border-gray-100 p-4 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      {!isDesktop ? (
                        <Button
                          size="small"
                          variant="text"
                          icon={<ArrowLeftRegular />}
                          onClick={() => syncQuery({ iccid: "", profile_aid: "" })}
                        >
                          {t("返回")}
                        </Button>
                      ) : null}
                      <div className="min-w-0 text-sm text-gray-400">
                        {t("未选择卡或Profile")}
                      </div>
                    </div>
                    <Tabs
                      className="mt-3"
                      value={menu}
                      onChange={(key) => syncQuery({ menu: key })}
                      tabs={MENUS.map((item) => ({ key: item.key, label: t(item.label) }))}
                    />
                  </div>
                  <div className="flex flex-1 items-center justify-center p-6">
                    <EmptyState title={t("请选择左侧的卡或 Profile")} />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
