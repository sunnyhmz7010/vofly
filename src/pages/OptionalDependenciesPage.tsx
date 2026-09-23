import { useCallback, useEffect, useState } from "react";
import { ArrowDownloadRegular, ArrowLeftRegular, CheckmarkRegular, DeleteRegular, SettingsRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { api, apiMessage } from "../api";
import type { DependencyJob, DependencyStatus } from "../types";
import { Button, PageHeader, Tag, confirmDialog, message } from "../components/ui";
import { CardDecor, CardIcon, CardTitle } from "../components/settings/Cards";
import { tf, useI18n } from "../lib/i18n";

const DEPENDENCY_META: Record<string, { name: string; description: string }> = {
  pcsc: { name: "PC/SC", description: "用于 USB SIM 读卡器和 CCID 设备" },
  ffmpeg: { name: "ffmpeg", description: "用于通话录音转码为 MP3" },
  singbox: { name: "sing-box", description: "用于 VLESS、VMess、Trojan、Shadowsocks 和 SOCKS5 协议代理" },
};

function jobLabel(state: DependencyJob["state"], t: (value: string) => string) {
  if (state === "queued") return t("排队中");
  if (state === "running") return t("处理中");
  if (state === "success") return t("已完成");
  if (state === "failed") return t("失败");
  return state;
}

export default function OptionalDependenciesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<DependencyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [jobs, setJobs] = useState<Record<string, DependencyJob | undefined>>({});

  const fetchDependencies = useCallback(async () => {
    try {
      setStatuses(await api<DependencyStatus[]>("/system/dependencies"));
    } catch (error) {
      message.error(apiMessage(error) || t("依赖状态加载失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchDependencies();
  }, [fetchDependencies]);

  const run = useCallback(async (item: DependencyStatus, operation: "install" | "uninstall") => {
    if (operation === "uninstall") {
      const confirmed = await confirmDialog(
        tf("确定卸载 {name} 吗？", { name: DEPENDENCY_META[item.id]?.name || item.id }),
        t("确认卸载可选组件"),
        { confirmText: t("卸载"), cancelText: t("取消"), type: "warning" },
      );
      if (!confirmed) return;
    }

    setBusyId(item.id);
    try {
      const job = await api<DependencyJob>(`/system/dependencies/${item.id}/${operation}`, {
        method: operation === "install" ? "POST" : "DELETE",
      });
      setJobs((current) => ({ ...current, [item.id]: job }));
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const current = await api<DependencyJob>(`/system/dependencies/jobs/${encodeURIComponent(job.id)}`);
        setJobs((previous) => ({ ...previous, [item.id]: current }));
        if (current.state === "success") {
          await fetchDependencies();
          message.success(operation === "install" ? t("组件安装完成") : t("组件卸载完成"));
          return;
        }
        if (current.state === "failed") throw new Error(current.error || t("依赖任务失败"));
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      throw new Error(t("依赖任务超时"));
    } catch (error) {
      message.error(apiMessage(error) || (error instanceof Error ? error.message : t("依赖操作失败")));
      await fetchDependencies();
    } finally {
      setBusyId("");
    }
  }, [fetchDependencies, t]);

  const optional = statuses.filter((item) => item.id === "pcsc" || item.id === "ffmpeg" || item.id === "singbox");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("可选组件")}
        actions={(
          <Button variant="default" icon={<ArrowLeftRegular />} onClick={() => navigate("/settings")}>
            {t("返回系统设置")}
          </Button>
        )}
      />
      <div className="ui-card group relative overflow-hidden p-6 sm:p-8">
        <CardDecor />
        <div className="relative z-10 mb-6 flex items-center gap-3">
          <CardIcon><SettingsRegular className="text-[24px]" /></CardIcon>
          <div>
            <CardTitle title={t("可选组件管理")} />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("按需安装和卸载额外运行组件")}</p>
          </div>
        </div>
        {loading ? <div className="relative z-10 py-8 text-center text-sm text-gray-400">{t("加载中...")}</div> : null}
        {!loading && optional.length === 0 ? <div className="relative z-10 py-8 text-center text-sm text-gray-400">{t("暂无可选组件")}</div> : null}
        {!loading && optional.length > 0 ? (
          <div className="relative z-10 space-y-3">
            {optional.map((item) => {
              const meta = DEPENDENCY_META[item.id] || { name: item.id, description: item.reason || "" };
              const job = jobs[item.id];
              const busy = busyId === item.id || item.busy;
              const installed = item.installed;
              const actionDisabled = busy || (installed ? !item.canUninstall : !item.canInstall);
              return (
                <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t(meta.name)}</h3>
                        <Tag type={installed ? "success" : "info"}>{installed ? t("已安装") : t("未安装")}</Tag>
                        {job && (job.state === "queued" || job.state === "running") ? <Tag type="warning">{jobLabel(job.state, t)} {job.progress > 0 ? `${job.progress}%` : ""}</Tag> : null}
                        {job?.state === "failed" ? <Tag type="danger">{jobLabel(job.state, t)}</Tag> : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(meta.description)}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                        {item.version ? <span>{t("版本")}：<code>{item.version}</code></span> : null}
                        {item.path ? <span>{t("路径")}：<code>{item.path}</code></span> : null}
                      </div>
                      {!item.available ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{item.reason || t("当前系统没有可用的包管理器")}</p> : null}
                      {job?.state === "failed" && job.error ? <p className="mt-2 text-xs text-red-500">{job.error}</p> : null}
                    </div>
                    <Button
                      size="small"
                      variant={installed ? "warning" : "primary"}
                      icon={installed ? <DeleteRegular /> : <ArrowDownloadRegular />}
                      loading={busyId === item.id}
                      disabled={actionDisabled}
                      onClick={() => void run(item, installed ? "uninstall" : "install")}
                    >
                      {installed ? t("卸载") : t("安装")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="relative z-10 mt-5 flex items-start gap-2 border-t border-gray-100 pt-4 text-xs text-gray-400 dark:border-white/10">
          <CheckmarkRegular className="mt-0.5 shrink-0" />
          <span>{t("可选组件由系统包管理器按需安装；卸载只会移除由 vofly 记录的组件。")}</span>
        </div>
      </div>
    </div>
  );
}
