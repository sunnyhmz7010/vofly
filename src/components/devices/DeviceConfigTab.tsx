import { useEffect, useRef, useState, type ReactNode } from "react";
import { SettingsRegular, DeleteRegular, SaveRegular } from "@fluentui/react-icons";
import { Button, Input, Select, Tooltip } from "../ui";
import { api } from "../../api";
import { isDeviceOnline, isQmiControl } from "./shared";
import { CellularIMSConfigCard } from "./CellularIMSConfigCard";
import type { DeviceConfig } from "../../types";
import type { DeviceDetail } from "./types";
import { useI18n } from "../../lib/i18n";
import { DEVICE_TYPES, deviceTypeImage } from "../../lib/deviceTypes";

export interface DeviceConfigTabProps {
  editConfig: DeviceConfig | null;
  deviceStatus: DeviceDetail | null;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onDelete: () => void;
  onEditConfig: (next: DeviceConfig) => void;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function DeviceConfigTab({ editConfig, deviceStatus, saving, deleting, onSave, onDelete, onEditConfig }: DeviceConfigTabProps) {
  const { t } = useI18n();
  const controlDevice = deviceStatus?.controlDevice || editConfig?.controlDevice;
  const interfaceName = deviceStatus?.interface || editConfig?.interface;
  const atPort = deviceStatus?.atPort || editConfig?.atPort;
  const usbPath = deviceStatus?.usbPath || editConfig?.usbPath;
  const isQmi = isQmiControl(controlDevice);
  const isMbim = String(editConfig?.deviceBackend || "").toLowerCase() === "mbim";
	const isReader = editConfig?.deviceType === "usb_sim_reader";
	const supportsCellularIMS = !isReader && editConfig?.deviceType !== "wifi_410";
  const deviceOnline = deviceStatus ? isDeviceOnline(deviceStatus) : false;
  const deviceId = editConfig?.id || "";

  // The backend selector is switchable at runtime now: saving a changed value
  // makes the server verify the target hardware, re-open the device under the
  // new control plane and roll back on failure. The stored (truth) backend is
  // fetched separately because the add/config loader force-labels QMI-control
  // devices as "qmi"; without the correction a stored "at" choice would be
  // silently switched back on the next save.
  const [storedBackend, setStoredBackend] = useState<string | null>(null);
  const [userAdjusted, setUserAdjusted] = useState(false);

  useEffect(() => {
    setStoredBackend(null);
    setUserAdjusted(false);
    if (!deviceId) return;
    let cancelled = false;
    api<{ config?: DeviceConfig }>(`/devices/${deviceId}/config`)
      .then((res) => {
        if (cancelled) return;
        const backend = String(res?.config?.deviceBackend || "").toLowerCase();
        setStoredBackend(backend || null);
      })
      .catch(() => {
        if (!cancelled) setStoredBackend(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    if (userAdjusted || !storedBackend || !editConfig) return;
    if (String(editConfig.deviceBackend || "").toLowerCase() !== storedBackend) {
      onEditConfig({ ...editConfig, deviceBackend: storedBackend as DeviceConfig["deviceBackend"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedBackend, deviceId]);

  const currentBackend = String(editConfig?.deviceBackend || "").toLowerCase();
  const backendChanged = !isReader && storedBackend !== null && currentBackend !== storedBackend;
  const switching = saving && backendChanged;

  const backendOptions = isReader
    ? [{ value: "pcsc", label: "PC/SC" }]
    : [
        { value: "at", label: "AT" },
        { value: "qmi", label: "QMI", disabled: !controlDevice && currentBackend !== "qmi" },
        {
          value: "mbim",
          label: (
            <Tooltip content={t("MBIM 控制面暂不支持运行时切换")}>
              <span>{t("MBIM（开发中）")}</span>
            </Tooltip>
          ),
          disabled: true,
        },
      ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <SettingsRegular className="text-[22px]" />
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{t("设备配置")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("配置存储在数据库中，部分字段可能需要重启生效")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="danger" loading={deleting} onClick={onDelete} className="!border-0" icon={<DeleteRegular />}>
            {t("删除设备")}
          </Button>
          <Button variant="primary" loading={saving} onClick={onSave} className="!border-0" icon={<SaveRegular />}>
            {t("保存配置")}
          </Button>
        </div>
      </div>
      {editConfig ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="ID">
            <Input value={editConfig.id} disabled />
          </Field>
          <Field label={t("名称")}>
            <Input value={editConfig.name} onChange={(e) => onEditConfig({ ...editConfig, name: e.target.value })} placeholder={t("显示名称")} />
          </Field>
          <Field label={t("设备类型")}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-1.5 dark:border-white/10 dark:bg-white/5">
                <img src={deviceTypeImage(editConfig.deviceType)} alt="" className="h-full w-full object-contain" />
              </div>
              <Select
                value={editConfig.deviceType}
                onChange={(v) => onEditConfig({ ...editConfig, deviceType: v as DeviceConfig["deviceType"] })}
                options={DEVICE_TYPES.map((item) => ({ value: item.value, label: t(item.label) }))}
              />
            </div>
          </Field>
          <Field label={t("IMEI 绑定")}>
            <Input value={editConfig.modemImei || ""} disabled placeholder={t("自动识别（添加时绑定）")} />
          </Field>
          <Field label={t("设备路径")}>
            <Input value={usbPath || ""} disabled placeholder={t("由系统自动探测")} />
          </Field>
          <Field label={t("网卡接口")}>
            <Input value={interfaceName || ""} disabled placeholder={t("由系统自动探测")} />
          </Field>
          <Field label={t("AT 端口")}>
            <Input value={atPort || ""} disabled placeholder={t("由系统自动探测")} />
          </Field>
          <Field label={t("控制设备")}>
            <Input value={controlDevice || ""} disabled placeholder={t("由系统自动探测")} />
          </Field>
		  {isReader ? <Field label="SIM PIN">
			<Input type="password" value={editConfig.simPin || ""} onChange={(e) => onEditConfig({ ...editConfig, simPin: e.target.value })} maxLength={8} inputMode="numeric" placeholder={t("留空表示不修改；仅在 SIM 启用 PIN 时填写")} />
		  </Field> : null}
          <div className="ui-panel-muted space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{t("设备运行模式")}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {isMbim
                    ? t("MBIM 负责数据会话；AT 负责 SIM/eSIM、射频、短信、通话和终端指令")
                    : isQmi
                      ? t("QMI 负责驻网状态与数据会话；AT 负责 SIM/eSIM、射频、短信、通话和终端指令")
                      : t("AT 模式通过串口管理驻网与 PDP 数据会话")}
                </div>
              </div>
              <Select
                value={editConfig.deviceBackend}
                onChange={(v) => {
                  setUserAdjusted(true);
                  onEditConfig({ ...editConfig, deviceBackend: v as DeviceConfig["deviceBackend"] });
                }}
                className="w-[140px]"
                placeholder="AT"
                disabled={isReader || saving}
                options={backendOptions}
              />
            </div>
            {switching ? (
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                {t("正在校验硬件并切换后端，请稍候…")}
              </div>
            ) : backendChanged ? (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                {t("保存后将进行硬件校验并切换后端，可能需要约 30 秒；失败会自动回退到原后端")}
              </div>
            ) : null}
          </div>
          {supportsCellularIMS ? (
            <div className="lg:col-span-2">
              <CellularIMSConfigCard deviceId={editConfig.id} deviceOnline={deviceOnline} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
