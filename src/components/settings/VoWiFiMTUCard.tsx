import { SettingsRegular } from "@fluentui/react-icons";
import { useI18n } from "../../lib/i18n";
import { Switch } from "../ui/Switch";
import { CardDecor, CardIcon, CardTitle } from "./Cards";

export function VoWiFiMTUCard({
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
            <SettingsRegular className="text-[24px]" />
          </CardIcon>
          <CardTitle title={t("VoWiFi MTU 兼容模式")} />
        </div>
        <Switch
          checked={enabled}
          disabled={loading || saving || !ready}
          loading={saving}
          onChange={onToggle}
          ariaLabel={t("VoWiFi MTU 兼容模式")}
        />
      </div>
      <p className="relative z-10 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {t("默认关闭。遇到 MTU 不足导致的 VoWiFi 注册或连接问题时可尝试开启，保存后请重连 VoWiFi。")}
      </p>
    </div>
  );
}
