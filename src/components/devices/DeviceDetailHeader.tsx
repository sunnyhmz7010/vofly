import { ArrowSyncRegular, PowerRegular, ChatRegular, CallRegular } from "@fluentui/react-icons";
import { Button } from "../ui";
import type { DeviceDetail } from "./types";
import { useI18n } from "../../lib/i18n";
import { deviceTypeImage } from "../../lib/deviceTypes";
import { isVoWiFiInUse } from "./shared";

export interface DeviceDetailHeaderProps {
	device: DeviceDetail;
  rebooting: boolean;
  reconnectingVoWiFi: boolean;
	onCopyText: (text: string) => void;
  onReconnectVowifi: () => void;
  onRebootModem: () => void;
  onOpenSms: () => void;
  onOpenCall: () => void;
	wifiCallingOnly?: boolean;
	modemControlOnly?: boolean;
}

export function DeviceDetailHeader(props: DeviceDetailHeaderProps) {
  const { t } = useI18n();
  const { device } = props;
	const vowifiInUse = isVoWiFiInUse(device);
  return (
    <div className="ui-card p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <img src={deviceTypeImage(device.deviceType)} alt="" className="h-11 w-11 flex-shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="truncate text-xl font-extrabold text-gray-900 dark:text-white">{device.name || device.id}</div>
              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                <span className="cursor-pointer font-mono hover:underline" onClick={() => props.onCopyText(device.id)}>
                  {device.id}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
		  {vowifiInUse ? (
            <Button loading={props.reconnectingVoWiFi} onClick={props.onReconnectVowifi} className="ui-glass-border !border-0" icon={<ArrowSyncRegular />}>
              {t("重连 VoWiFi")}
            </Button>
		  ) : null}
		  {!props.wifiCallingOnly && !props.modemControlOnly ? <Button loading={props.rebooting} onClick={props.onRebootModem} className="ui-glass-border !border-0 hover:!text-red-600" icon={<PowerRegular />}>
            {t("重启模组")}
		  </Button> : null}
          {!props.modemControlOnly ? <Button onClick={props.onOpenSms} className="ui-glass-border !border-0" icon={<ChatRegular />}>
            {t("短信")}
          </Button> : null}
          {!props.modemControlOnly ? <Button onClick={props.onOpenCall} className="ui-glass-border !border-0" icon={<CallRegular />}>
            {t("通话")}
          </Button> : null}
        </div>
      </div>
    </div>
  );
}
