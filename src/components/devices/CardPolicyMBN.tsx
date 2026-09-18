import { useEffect, useState } from "react";
import { Select, message } from "../ui";
import { apiMessage } from "../../api";
import { useI18n } from "../../lib/i18n";
import type { CardPolicy } from "../../types";
import { updateCardPolicy } from "./deviceActions";

export function CardPolicyMBN({
  iccid,
  policy,
  disabled = false,
  compact = false,
  onSaved,
}: {
  iccid: string;
  policy: CardPolicy | null;
  disabled?: boolean;
  compact?: boolean;
  onSaved: (policy: CardPolicy) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const saved = policy?.mbnProfile || "";
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(policy?.mbnProfile || "");
  }, [iccid, policy?.mbnProfile]);

  const options = [
    { value: "", label: t("自动（按卡的 HPLMN 选择）") },
    { value: "OpenMkt-Commercial-CU", label: t("强制中国联通 OpenMkt") },
    { value: "Volte_OpenMkt-Commercial-CMCC", label: t("强制中国移动 VoLTE") },
    { value: "OpenMkt-Commercial-CT", label: t("强制中国电信 OpenMkt") },
  ];

  const save = async (next: string) => {
    if (!iccid || saving || next === saved) {
      setValue(saved);
      return;
    }
    setSaving(true);
    setValue(next);
    try {
      const updated = await updateCardPolicy(iccid, { mbnProfile: next });
      await onSaved(updated);
      message.success(
        updated.mbnProfile
          ? t("已保存强制 MBN；正在使用的卡更改后模组可能会重启")
          : t("已恢复自动选择 MBN"),
      );
    } catch (error) {
      setValue(saved);
      message.error(apiMessage(error) || t("保存 MBN 失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? "ui-panel-muted p-3" : "ui-panel-muted p-3 lg:col-span-2"}>
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">{t("MBN 配置")}</div>
      <Select value={value} options={options} disabled={disabled || saving} onChange={save} />
      <div className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
        {t("海外卡可按运营商指定 MBN；正在使用的卡更改后模组可能会重启。")}
      </div>
    </div>
  );
}
