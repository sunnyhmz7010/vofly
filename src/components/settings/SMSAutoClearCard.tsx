import { MailRegular } from "@fluentui/react-icons";
import { useI18n } from "../../lib/i18n";
import { Switch } from "../ui/Switch";
import { CardDecor, CardIcon, CardTitle } from "./Cards";

export function SMSAutoClearCard({
  enabled,
  loading,
  saving,
  ready,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  ready: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="ui-card group relative overflow-hidden p-8">
      <CardDecor />
      <div className="relative z-10 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CardIcon>
            <MailRegular className="text-[24px]" />
          </CardIcon>
          <CardTitle title={t("自动清理模组短信存储")} />
        </div>
        <Switch
          checked={enabled}
          disabled={loading || saving || !ready}
          loading={saving}
          onChange={onToggle}
          ariaLabel={t("自动清理模组短信存储")}
        />
      </div>
      <p className="relative z-10 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {t("入库成功后删除模组 SM/ME 副本，网页记录保留。关闭后模组存储可能在存满时无法接收新短信。")}
      </p>
    </div>
  );
}
