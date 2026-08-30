import { useCallback, useEffect, useState } from "react";
import { Button, Input, Spinner, message } from "../ui";
import { PolicySwitchCard } from "./PolicySwitchCard";
import { CardPolicyAPN } from "./CardPolicyAPN";
import { useCardPolicyToggles } from "./useCardPolicyToggles";
import { getCardPolicy, putCardPolicy, updateCardPolicy, enableVoWiFi, disableVoWiFi, setFlightMode } from "./deviceActions";
import type { CardPolicy } from "../../types";
import { apiMessage } from "../../api";
import { useI18n } from "../../lib/i18n";
import { isCardPolicyModeDisabled } from "./cardPolicyPresentation";

export interface EsimCardPolicyInlineProps {
  deviceId: string;
  iccid: string;
  isActiveCard: boolean;
  deviceOnline: boolean;
  onPolicyChanged: () => void;
	onToggleRoamingData?: (enabled: boolean) => Promise<boolean>;
}

export function EsimCardPolicyInline({ deviceId, iccid, isActiveCard, deviceOnline, onPolicyChanged, onToggleRoamingData }: EsimCardPolicyInlineProps) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<CardPolicy | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
	const [networkPending, setNetworkPending] = useState(false);
	const [networkFailed, setNetworkFailed] = useState(false);
  const [customPhoneNumber, setCustomPhoneNumber] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  const mode = isActiveCard && deviceOnline ? "live" : "stored";
  const noteText = mode === "live" ? "" : deviceOnline ? t("改动将在此卡激活后生效") : t("设备离线，改动已保存，激活/上线后生效");
  const flags = policy
    ? { vowifiEnabled: policy.vowifiEnabled, airplaneEnabled: policy.airplaneEnabled }
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await getCardPolicy(iccid);
      setPolicy(data);
      setCustomPhoneNumber(data.customPhoneNumber || "");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [iccid]);

  useEffect(() => {
    load();
  }, [load]);

  const toggles = useCardPolicyToggles(flags, {
    applyVoWiFi: (value, next) => (mode === "stored" ? putCardPolicy(iccid, next) : value ? enableVoWiFi(deviceId) : disableVoWiFi(deviceId)),
    applyAirplane: (value, next) => (mode === "stored" ? putCardPolicy(iccid, next) : setFlightMode(deviceId, value)),
    onChanged: onPolicyChanged,
  });
  const { local } = toggles;
	const networkEnabled = policy?.networkEnabled ?? false;
	const modeFlags = { networkEnabled, vowifiEnabled: local.vowifiEnabled, airplaneEnabled: local.airplaneEnabled };

  useEffect(() => {
    setCustomPhoneNumber(policy?.customPhoneNumber || "");
  }, [iccid, policy?.customPhoneNumber]);

	const savedPhoneNumber = policy?.customPhoneNumber || "";
	const phoneChanged = customPhoneNumber.trim() !== savedPhoneNumber;

  const saveCustomPhoneNumber = async () => {
    if (phoneSaving || !phoneChanged) return;
    setPhoneSaving(true);
    try {
      const saved = await updateCardPolicy(iccid, { customPhoneNumber: customPhoneNumber.trim() });
      setPolicy(saved);
      setCustomPhoneNumber(saved.customPhoneNumber || "");
      message.success(saved.customPhoneNumber ? t("自定义手机号已保存") : t("已恢复显示系统读取的号码"));
      await onPolicyChanged();
    } catch (error) {
      message.error(apiMessage(error) || t("保存自定义手机号失败"));
    } finally {
      setPhoneSaving(false);
    }
  };

	const toggleNetwork = async (enabled: boolean) => {
	  if (!policy || networkPending) return;
	  setNetworkPending(true);
	  setNetworkFailed(false);
	  try {
		if (mode === "stored") {
		  const saved = await updateCardPolicy(iccid, {
			networkEnabled: enabled,
			vowifiEnabled: enabled ? false : policy.vowifiEnabled,
			airplaneEnabled: enabled ? false : policy.airplaneEnabled,
		  });
		  setPolicy(saved);
		} else {
		  const ok = await onToggleRoamingData?.(enabled);
		  if (!ok) throw new Error("network policy failed");
		  await load();
		}
		await onPolicyChanged();
	  } catch {
		setNetworkFailed(true);
	  } finally {
		setNetworkPending(false);
	  }
	};

  return (
    <div className="space-y-3 rounded-lg bg-gray-50/60 px-4 py-3 dark:bg-white/5">
      {loading ? (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Spinner className="h-3.5 w-3.5 animate-spin" />
          {t("正在加载策略...")}
        </div>
      ) : failed ? (
        <div className="flex items-center gap-2 text-xs text-orange-500">
          {t("策略加载失败")}
          <Button variant="text" size="small" onClick={load}>
            {t("重试")}
          </Button>
        </div>
      ) : (
        <>
          {noteText ? <div className="text-[11px] text-amber-600 dark:text-amber-400">{noteText}</div> : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="ui-panel-muted p-3 sm:col-span-2">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">{t("自定义手机号")}</div>
              <div className="flex items-center gap-2">
                <Input
                  value={customPhoneNumber}
                  onChange={(event) => setCustomPhoneNumber(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveCustomPhoneNumber();
                  }}
                  placeholder={t("请输入手机号（可留空）")}
                  inputMode="tel"
                  maxLength={32}
                  disabled={phoneSaving}
                  aria-label={t("自定义手机号")}
                />
                <Button
                  variant="primary"
                  size="small"
                  className="shrink-0 !border-0"
                  loading={phoneSaving}
                  disabled={!phoneChanged}
                  onClick={() => void saveCustomPhoneNumber()}
                >
                  {t("保存")}
                </Button>
              </div>
              <div className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {t("支持开头的 + 和 3-20 位数字；留空时显示系统从 SIM/网络读取的号码")}
              </div>
            </div>
            <PolicySwitchCard
              compact
              title="VoWiFi"
              checked={local.vowifiEnabled}
              disabled={toggles.vowifiPending || isCardPolicyModeDisabled("vowifi", modeFlags)}
              pending={toggles.vowifiPending}
              failed={toggles.vowifiFailed}
              onToggle={toggles.onVoWiFiToggle}
            />
            <PolicySwitchCard
              compact
              title={t("飞行")}
              checked={local.airplaneEnabled}
              disabled={local.vowifiEnabled || toggles.airplanePending || isCardPolicyModeDisabled("airplane", modeFlags)}
              pending={toggles.airplanePending}
              failed={toggles.airplaneFailed}
              onToggle={toggles.onAirplaneToggle}
            />
			<PolicySwitchCard
			  compact
			  title={t("漫游数据")}
			  checked={networkEnabled}
			  disabled={networkPending || (mode === "live" && !onToggleRoamingData) || isCardPolicyModeDisabled("network", modeFlags)}
			  pending={networkPending}
			  failed={networkFailed}
			  onToggle={(value) => void toggleNetwork(value)}
			/>
          </div>
          <CardPolicyAPN
            deviceId={deviceId}
            iccid={iccid}
            policy={policy}
            deviceOnline={deviceOnline}
            onSaved={(saved) => {
              setPolicy(saved);
              onPolicyChanged();
            }}
          />
        </>
      )}
    </div>
  );
}
