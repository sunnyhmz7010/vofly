import { ArrowRightRegular, SettingsRegular } from "@fluentui/react-icons";
import type { DependencyStatus } from "../../types";
import { Button, Tag } from "../ui";
import { CardDecor, CardIcon, CardTitle } from "./Cards";
import { tf, useI18n } from "../../lib/i18n";
import { useNavigate } from "react-router-dom";

export function OptionalDependenciesCard({ statuses }: { statuses: DependencyStatus[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const optional = statuses.filter((item) => item.id === "pcsc" || item.id === "ffmpeg" || item.id === "singbox");
  const installedCount = optional.filter((item) => item.installed).length;
  return (
    <div className="ui-card group relative overflow-hidden p-8">
      <CardDecor />
      <div className="relative z-10 mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><CardIcon><SettingsRegular className="text-[24px]" /></CardIcon><CardTitle title={t("可选组件")} /></div>
        <Button size="small" variant="primary" icon={<ArrowRightRegular />} onClick={() => navigate("/settings/dependencies")}>{t("管理")}</Button>
      </div>
      <div className="relative z-10 mb-4 text-sm text-gray-500 dark:text-gray-400">{tf("已安装 {count} 项", { count: installedCount })}</div>
      <div className="relative z-10 grid gap-3 md:grid-cols-3">
        {optional.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-4 dark:bg-white/5">
            <div className="min-w-0"><div className="truncate font-semibold">{item.id === "pcsc" ? "PC/SC" : item.id === "ffmpeg" ? "ffmpeg" : "sing-box"}</div><div className="mt-1 truncate text-xs text-gray-400">{item.reason || t("状态待检查")}</div></div>
            <Tag type={item.installed ? "success" : "info"}>{item.installed ? t("已安装") : t("未安装")}</Tag>
          </div>
        ))}
      </div>
      {optional.length === 0 ? <div className="relative z-10 text-sm text-gray-400">{t("状态待检查")}</div> : null}
    </div>
  );
}
