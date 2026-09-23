import { AddRegular, DeleteRegular, EditRegular, PauseRegular, PlayRegular, SettingsRegular } from "@fluentui/react-icons";
import type { DependencyStatus, SingBoxProxy } from "../../types";
import { Button, Tag } from "../ui";
import { useI18n } from "../../lib/i18n";

export interface SingBoxSectionProps {
  rows: SingBoxProxy[];
  dependency?: DependencyStatus;
  loading?: boolean;
  onCreate: () => void;
  onEdit: (row: SingBoxProxy) => void;
  onDelete: (row: SingBoxProxy) => void;
  onToggle: (row: SingBoxProxy) => void;
  onManageDependencies: () => void;
  busyId?: string;
}

export function SingBoxSection({ rows, dependency, loading, onCreate, onEdit, onDelete, onToggle, onManageDependencies, busyId }: SingBoxSectionProps) {
  const { t } = useI18n();
  const installed = dependency?.installed === true;
  return (
    <section className="ui-card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-white/10">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{t("协议代理（sing-box）")}</h2>
          <p className="mt-1 text-xs text-gray-400">{t("URI 由 sing-box 接管，自动生成 127.0.0.1 SOCKS5 监听")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" variant="default" icon={<SettingsRegular />} onClick={onManageDependencies}>{t("管理依赖")}</Button>
          <Button size="small" variant="primary" icon={<AddRegular />} disabled={!installed} onClick={onCreate}>{t("新增协议代理")}</Button>
        </div>
      </div>
      {dependency && !installed ? <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">{dependency.reason || t("请先安装 sing-box")}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/70 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-white/[0.025]"><tr>
            <th className="px-4 py-3">{t("名称")}</th><th className="px-4 py-3">{t("协议")}</th><th className="px-4 py-3">{t("目标服务器")}</th><th className="px-4 py-3">{t("本地 SOCKS5")}</th><th className="px-4 py-3">{t("运行状态")}</th><th className="px-4 py-3 text-right">{t("操作")}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-sky-50/40 dark:hover:bg-sky-500/[0.04]">
                <td className="px-4 py-3 font-semibold">{row.name || row.id}</td>
                <td className="px-4 py-3"><Tag type="primary">{row.protocol.toUpperCase()}</Tag></td>
                <td className="px-4 py-3 font-mono text-xs">{row.server ? `${row.server}:${row.serverPort || ""}` : "-"}</td>
                <td className="px-4 py-3"><span className="font-mono text-xs">{row.localSocks5.addr}</span><div className="mt-1 text-[11px] text-gray-400">{t("由 sing-box 接管")}</div></td>
                <td className="px-4 py-3"><Tag type={row.runtime.state === "running" ? "success" : row.runtime.state === "error" ? "danger" : "info"}>{row.runtime.state}</Tag>{row.runtime.error ? <div className="mt-1 max-w-xs truncate text-[11px] text-red-500">{row.runtime.error}</div> : null}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <Button size="small" variant={row.enabled ? "warning" : "success"} plain icon={row.enabled ? <PauseRegular /> : <PlayRegular />} loading={busyId === row.id} onClick={() => onToggle(row)}>{row.enabled ? t("禁用") : t("启用")}</Button>
                  <Button size="small" icon={<EditRegular />} onClick={() => onEdit(row)}>{t("编辑")}</Button>
                  <Button size="small" variant="danger" plain icon={<DeleteRegular />} onClick={() => onDelete(row)}>{t("删除")}</Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? <div className="px-4 py-8 text-center text-sm text-gray-400">{t("加载中...")}</div> : null}
      {!loading && rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-gray-400">{t("暂无 sing-box 协议代理")}</div> : null}
    </section>
  );
}
