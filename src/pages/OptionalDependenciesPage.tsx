import { useCallback, useEffect, useRef, useState } from "react";
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

function phaseLabel(phase: string, t: (value: string) => string) {
  const labels: Record<string, string> = {
    checking: "检查已安装软件包",
    downloading: "下载官方安装脚本",
    installing: "安装组件",
    uninstalling: "卸载组件",
    recording: "记录安装状态",
    service: "管理 PC/SC 服务",
    finished: "任务结束",
  };
  return t(labels[phase] || phase);
}

export default function OptionalDependenciesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<DependencyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [jobs, setJobs] = useState<Record<string, DependencyJob | undefined>>({});
  const outputRefs = useRef<Record<string, HTMLPreElement | null>>({});
  const followOutput = useRef<Record<string, boolean>>({});

  useEffect(() => {
    for (const id of Object.keys(jobs)) {
      const output = outputRefs.current[id];
      if (output && followOutput.current[id] !== false) output.scrollTop = output.scrollHeight;
    }
  }, [jobs]);

  const fetchDependencies = useCallback(async () => {
    try {
      const next = await api<DependencyStatus[]>("/system/dependencies", { cache: "no-store" });
      setStatuses(next);
      setLoadError("");
      const recovered = await Promise.all(next.filter((item) => item.latestJobId).map(async (item) => {
        try {
          return { id: item.id, job: await api<DependencyJob>(`/system/dependencies/jobs/${encodeURIComponent(item.latestJobId!)}`, { cache: "no-store" }) };
        } catch {
          return null;
        }
      }));
      setJobs((current) => {
        const updated: Record<string, DependencyJob | undefined> = {};
        for (const item of next) {
          const entry = recovered.find((candidate) => candidate?.id === item.id);
          if (entry) updated[item.id] = entry.job;
          else if (current[item.id]?.id === item.latestJobId) updated[item.id] = current[item.id];
        }
        return updated;
      });
      setPollError("");
    } catch (error) {
      setLoadError(apiMessage(error) || t("依赖状态加载失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchDependencies();
  }, [fetchDependencies]);

  useEffect(() => {
    const active = statuses.filter((item) => item.activeJobId);
    if (active.length === 0) return;
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const updates = await Promise.all(active.map(async (item) => ({
          id: item.id,
          job: await api<DependencyJob>(`/system/dependencies/jobs/${encodeURIComponent(item.activeJobId!)}`, { cache: "no-store" }),
        })));
        if (stopped) return;
        setJobs((current) => {
          const updated = { ...current };
          for (const entry of updates) updated[entry.id] = entry.job;
          return updated;
        });
        setPollError("");
        if (updates.some(({ job }) => job.state === "success" || job.state === "failed")) {
          await fetchDependencies();
        }
      } catch (error) {
        if (!stopped) setPollError(apiMessage(error) || t("依赖任务状态加载失败，正在重试"));
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [statuses, fetchDependencies, t]);

  const run = useCallback(async (item: DependencyStatus, operation: "install" | "uninstall") => {
    if (operation === "uninstall") {
      const confirmed = await confirmDialog(
        tf("确定卸载 {name} 吗？", { name: DEPENDENCY_META[item.id]?.name || item.id }),
        t("确认卸载可选组件"),
        { confirmText: t("卸载"), cancelText: t("取消"), type: "warning" },
      );
      if (!confirmed) return;
    }

    setPendingId(item.id);
    try {
      const path = operation === "install" ? `/system/dependencies/${item.id}/install` : `/system/dependencies/${item.id}`;
      const job = await api<DependencyJob>(path, {
        method: operation === "install" ? "POST" : "DELETE",
      });
      setJobs((current) => ({ ...current, [item.id]: job }));
      setStatuses((current) => current.map((status) => status.id === item.id
        ? { ...status, busy: true, activeJobId: job.id, latestJobId: job.id }
        : status));
      await fetchDependencies();
    } catch (error) {
      message.error(apiMessage(error) || (error instanceof Error ? error.message : t("依赖操作失败")));
      await fetchDependencies();
    } finally {
      setPendingId("");
    }
  }, [fetchDependencies, t]);

  const optional = statuses.filter((item) => item.id === "pcsc" || item.id === "ffmpeg" || item.id === "singbox");
  const anyBusy = !!pendingId || optional.some((item) => item.busy || item.activeJobId);

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
        {loadError ? <div className="relative z-10 mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"><span>{loadError}</span><Button size="small" onClick={() => void fetchDependencies()}>{t("重试")}</Button></div> : null}
        {pollError ? <div className="relative z-10 mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{pollError}</div> : null}
        {!loading && !loadError && optional.length === 0 ? <div className="relative z-10 py-8 text-center text-sm text-gray-400">{t("暂无可选组件")}</div> : null}
        {!loading && optional.length > 0 ? (
          <div className="relative z-10 space-y-3">
            {optional.map((item) => {
              const meta = DEPENDENCY_META[item.id] || { name: item.id, description: item.reason || "" };
              const job = jobs[item.id];
              const busy = pendingId === item.id || item.busy || job?.state === "queued" || job?.state === "running";
              const installed = item.installed;
              const actionDisabled = anyBusy || !!loadError || busy || (installed ? !item.canUninstall : !item.canInstall);
              return (
                <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t(meta.name)}</h3>
                        <Tag type={installed ? "success" : "info"}>{installed ? t("已安装") : t("未安装")}</Tag>
                        {installed ? <Tag type={item.managed ? "info" : "warning"}>{item.managed ? t("由 vofly 管理") : t("系统已有，非 vofly 管理")}</Tag> : null}
                        {job && (job.state === "queued" || job.state === "running") ? <Tag type="warning">{jobLabel(job.state, t)} {job.progress > 0 ? `${job.progress}%` : ""}</Tag> : null}
                        {job?.state === "failed" ? <Tag type="danger">{jobLabel(job.state, t)}</Tag> : null}
                        {job?.state === "success" ? <Tag type="success">{jobLabel(job.state, t)}</Tag> : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(meta.description)}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                        {item.version ? <span className="break-all">{t("版本")}：<code>{item.version}</code></span> : null}
                        {item.path ? <span className="break-all">{t("路径")}：<code>{item.path}</code></span> : null}
                      </div>
                      {!item.available ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{t("当前系统没有可用的包管理器")}</p> : null}
                    </div>
                    <Button
                      size="small"
                      variant={installed ? "warning" : "primary"}
                      icon={installed ? <DeleteRegular /> : <ArrowDownloadRegular />}
                      loading={pendingId === item.id}
                      disabled={actionDisabled}
                      onClick={() => void run(item, installed ? "uninstall" : "install")}
                    >
                      {busy ? t("执行中") : installed ? t("卸载") : t("安装")}
                    </Button>
                  </div>
                  {job ? (
                    <div className="mt-4 space-y-2 border-t border-gray-200 pt-3 text-xs dark:border-white/10">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400" aria-live="polite">
                        <span>{job.operation === "install" ? t("安装") : t("卸载")} · {jobLabel(job.state, t)}{job.state === "running" ? ` · ${job.progress}%` : ""}</span>
                        {job.phase ? <span>{phaseLabel(job.phase, t)}</span> : null}
                        <span>{t("任务 ID")}：<code>{job.id}</code></span>
                        {job.startedAt ? <span>{t("开始时间")}：{new Date(job.startedAt).toLocaleString()}</span> : null}
                        {job.finishedAt ? <span>{t("结束时间")}：{new Date(job.finishedAt).toLocaleString()}</span> : null}
                      </div>
                      {job.command ? <div><div className="mb-1 font-medium text-gray-600 dark:text-gray-300">{t(job.state === "running" ? "当前命令" : "最后执行命令")}</div><code className="block break-all rounded-lg bg-gray-900 p-2 text-gray-100">{job.command}</code></div> : null}
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2 font-medium text-gray-600 dark:text-gray-300"><span>{t("命令输出")}</span>{job.outputTruncated ? <span className="font-normal text-gray-400">{t("仅显示最近 32 KB 输出")}</span> : null}</div>
                        <pre
                          ref={(node) => { outputRefs.current[item.id] = node; }}
                          onScroll={(event) => {
                            const output = event.currentTarget;
                            followOutput.current[item.id] = output.scrollHeight - output.scrollTop - output.clientHeight < 32;
                          }}
                          className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-100"
                        >{job.output || t(job.state === "queued" || job.state === "running" ? "等待命令输出" : "命令未产生输出")}</pre>
                      </div>
                      {job.state === "failed" && job.error ? <p className="text-red-500">{job.error}</p> : null}
                    </div>
                  ) : null}
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
