import { ArrowDownloadRegular, CheckmarkRegular, DeleteRegular } from "@fluentui/react-icons";
import { api, apiMessage } from "../../api";
import type { DependencyJob, DependencyStatus } from "../../types";
import { Button, confirmDialog, message } from "../ui";
import { CardDecor, CardIcon, CardTitle } from "./Cards";
import { useI18n } from "../../lib/i18n";

export function OptionalDependenciesCard({ statuses, onRefresh }: { statuses: DependencyStatus[]; onRefresh: () => Promise<void> }) {
  const { t } = useI18n();
  const optional = statuses.filter((item) => item.id === "pcsc" || item.id === "ffmpeg");
  const run = async (item: DependencyStatus, operation: "install" | "uninstall") => {
    if (operation === "uninstall") {
      const confirmed = await confirmDialog(
        t(`确定卸载 ${item.id === "pcsc" ? "PC/SC" : "ffmpeg"} 吗？`),
        t("确认卸载可选组件"),
        { confirmText: t("卸载"), cancelText: t("取消"), type: "warning" },
      );
      if (!confirmed) return;
    }
    try {
      const job = await api<DependencyJob>(`/system/dependencies/${item.id}/${operation}`, { method: operation === "install" ? "POST" : "DELETE" });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const current = await api<DependencyJob>(`/system/dependencies/jobs/${encodeURIComponent(job.id)}`);
        if (current.state === "success") {
          await onRefresh();
          return;
        }
        if (current.state === "failed") throw new Error(current.error || t("依赖任务失败"));
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      throw new Error(t("依赖任务超时"));
    } catch (error) {
      message.error(apiMessage(error) || (error instanceof Error ? error.message : t("依赖操作失败")));
      await onRefresh();
    }
  };
  return (
    <div className="ui-card group relative overflow-hidden p-8 lg:col-span-2">
      <CardDecor />
      <div className="relative z-10 mb-6 flex items-center gap-3"><CardIcon><CheckmarkRegular className="text-[24px]" /></CardIcon><CardTitle title={t("可选组件")} /></div>
      <div className="relative z-10 grid gap-3 md:grid-cols-2">
        {optional.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-4 dark:bg-white/5">
            <div><div className="font-semibold">{item.id === "pcsc" ? "PC/SC" : "ffmpeg"}</div><div className="mt-1 text-xs text-gray-400">{item.reason}</div>{!item.available ? <div className="mt-1 text-xs text-amber-600">{t("当前系统没有可用的包管理器")}</div> : null}</div>
            <Button size="small" variant={item.installed ? "warning" : "primary"} icon={item.installed ? <DeleteRegular /> : <ArrowDownloadRegular />} disabled={item.busy || (item.installed ? !item.canUninstall : !item.canInstall)} onClick={() => void run(item, item.installed ? "uninstall" : "install")}>
              {item.installed ? t("卸载") : t("安装")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
