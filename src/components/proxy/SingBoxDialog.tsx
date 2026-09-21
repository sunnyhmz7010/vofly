import { Button, Input, Modal } from "../ui";
import { Field, SectionHeader, ToggleRow } from "./formUi";
import { useI18n } from "../../lib/i18n";

export interface SingBoxForm {
  id: string;
  name: string;
  uri: string;
  enabled: boolean;
}

export interface SingBoxDialogProps {
  open: boolean;
  editing: boolean;
  form: SingBoxForm;
  busy?: boolean;
  error?: string;
  onPatch: (patch: Partial<SingBoxForm>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function SingBoxDialog({ open, editing, form, busy = false, error, onPatch, onClose, onSubmit }: SingBoxDialogProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("编辑协议代理") : t("新增协议代理")}
      width="max-w-2xl"
      footer={(
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button variant="primary" loading={busy} disabled={busy || !form.uri.trim()} onClick={onSubmit}>
            {editing ? t("更新") : t("创建")}
          </Button>
        </>
      )}
    >
      <div className="space-y-5 pb-5">
        <SectionHeader tone="indigo" title={t("协议代理（sing-box）")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("名称")}>
            <Input value={form.name} placeholder={t("例如：新加坡节点")} onChange={(event) => onPatch({ name: event.target.value })} />
          </Field>
          <Field label={t("代理 ID")}>
            <Input value={form.id} disabled={editing} placeholder={t("可留空，将自动创建")} onChange={(event) => onPatch({ id: event.target.value })} />
          </Field>
        </div>
        <Field label={t("协议 URI")}>
          <textarea
            className="min-h-32 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
            value={form.uri}
            placeholder="vless://uuid@example.com:443?encryption=none#node"
            onChange={(event) => onPatch({ uri: event.target.value })}
          />
          <div className="mt-1 text-xs text-gray-400">{t("支持 VLESS、VMess、Trojan、Shadowsocks 和 SOCKS5 URI")}</div>
        </Field>
        <ToggleRow title={t("启用协议代理")} checked={form.enabled} onChange={(enabled) => onPatch({ enabled })} />
        {editing ? <div className="text-xs text-gray-400">{t("编辑时仅提供新的 URI，原 URI 不会回显")}</div> : null}
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div> : null}
      </div>
    </Modal>
  );
}
