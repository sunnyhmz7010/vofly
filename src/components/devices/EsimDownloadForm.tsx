import { AddRegular, ArrowDownloadRegular, DocumentArrowUpRegular } from "@fluentui/react-icons";
import { useRef, useState } from "react";
import { cx } from "../../lib/utils";
import { Button, Input, Select, message } from "../ui";
import type { EsimChipInfo, EsimDownloadForm } from "./types";
import { tf, useI18n } from "../../lib/i18n";

// Pre-listed so Tailwind generates them; index by quantized percent.
const WIDTHS = [
  "w-[0%]", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]",
  "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-[100%]",
];

export interface EsimDownloadFormProps {
  form: EsimDownloadForm;
  chipInfo: EsimChipInfo | null;
  downloading: boolean;
  downloadPct: number;
  downloadMsg: string;
  downloadErr: string;
  onFormChange: (next: EsimDownloadForm) => void;
  onDownload: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      {children}
    </div>
  );
}

export function EsimDownloadForm(props: EsimDownloadFormProps) {
  const { t } = useI18n();
  const { form, chipInfo } = props;
  const set = (patch: Partial<EsimDownloadForm>) => props.onFormChange({ ...form, ...patch });
  const eidOptions = (chipInfo?.eids || []).map((e, i) => ({
    value: e.aid || "",
    label: tf("eUICC #{n} (...{tail}) — {free} 可用", { n: i + 1, tail: e.eid.slice(-4), free: e.freeNvram }),
  }));
  const widthClass = WIDTHS[Math.min(20, Math.round(props.downloadPct / 5))];
  const uploadRef = useRef<HTMLInputElement>(null);
  const [decoding, setDecoding] = useState(false);

  const decodeActivation = async (file: File) => {
    setDecoding(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/esim/actions/decode-activation", {
        method: "POST",
        body,
        credentials: "include",
        headers: (() => {
          const token = sessionStorage.getItem("vofly.csrf");
          const headers: Record<string, string> ={};
          if (token) headers["X-CSRF-Token"] = token;
          return headers;
        })(),
      });
      const payload = await response.json() as { data?: { smdpAddress?: string; matchingId?: string; confirmationCode?: string }; error?: { message?: string } };
      if (!response.ok || !payload.data?.smdpAddress) throw new Error(payload.error?.message || t("无法解析激活码"));
      set({
        smdp: payload.data.smdpAddress,
        matchingId: payload.data.matchingId || "",
        confirmationCode: payload.data.confirmationCode || "",
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("无法解析激活码"));
    } finally {
      setDecoding(false);
    }
  };

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          <AddRegular className="text-[16px]" />
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-white">{t("下载新 Profile")}</div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label={t("SM-DP+ 地址 *")}>
          <Input value={form.smdp} onChange={(e) => set({ smdp: e.target.value })} placeholder={t("例如 rsp.truphone.com")} />
        </Field>
        <Field label="Matching ID">
          <Input value={form.matchingId} onChange={(e) => set({ matchingId: e.target.value })} placeholder={t("可选")} />
        </Field>
        <Field label={t("确认码")}>
          <Input value={form.confirmationCode} onChange={(e) => set({ confirmationCode: e.target.value })} placeholder={t("可选")} />
        </Field>
        <Field label={t("目标 eUICC")}>
          <Select value={form.aidHex} onChange={(v) => set({ aidHex: v })} placeholder={t("选择目标 eUICC")} options={eidOptions} />
        </Field>
      </div>
      {props.downloading || props.downloadErr ? (
        <div className="mt-4 space-y-1.5">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
            <div
              className={cx(
                "h-full rounded-full transition-all",
                widthClass,
                props.downloadErr ? "bg-red-500" : props.downloadPct >= 100 ? "bg-green-500" : "bg-[#0ea5e9]",
              )}
            />
          </div>
          <div className={cx("text-xs", props.downloadErr ? "text-red-500" : "text-gray-500 dark:text-gray-400")}>
            {props.downloadErr || props.downloadMsg}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <input
          ref={uploadRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void decodeActivation(file);
          }}
        />
        <Button variant="text" loading={decoding} disabled={props.downloading || decoding} onClick={() => uploadRef.current?.click()} icon={<DocumentArrowUpRegular />}>
          {t("扫描二维码/PDF")}
        </Button>
        <Button variant="primary" loading={props.downloading} disabled={props.downloading} onClick={props.onDownload} className="!border-0" icon={<ArrowDownloadRegular />}>
          {t("开始下载")}
        </Button>
      </div>
    </div>
  );
}
