import { useCallback, useEffect, useState } from "react";
import { DeleteRegular, PlayRegular, SaveRegular } from "@fluentui/react-icons";
import { api, apiMessage } from "../../api";
import {
  balancePlanPath,
  balancePlanRunPath,
  cardBalancePlansPath,
  planKindLabel,
  type QueryCardContext,
} from "../../lib/queryCenter";
import { confirmDialog } from "../ui/MessageBox";
import { tf, tl, useI18n } from "../../lib/i18n";
import { Button, Input, Switch, Tag, message } from "../ui";
import type { BalancePlan } from "../../types";

type PlanKind = "balance_query" | "renewal_reminder";

interface PlanForm {
  name: string;
  intervalDays: string;
  startDate: string;
  runTime: string;
  timezone: string;
  enabled: boolean;
  notify: boolean;
}

function emptyForm(kind: PlanKind, timezone: string): PlanForm {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  return {
    name: kind === "balance_query" ? tl("余额自动查询") : tl("续费提醒"),
    intervalDays: "30",
    startDate: tomorrow.toISOString().slice(0, 10),
    runTime: "09:00",
    timezone,
    enabled: true,
    notify: true,
  };
}

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "—" : time.toLocaleString();
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// BalancePlansPanel 管理当前卡的余额自动查询与续费/保号提醒计划。
// 渠道分发与切卡语义由后端固定，这里不提供渠道选择或切卡开关。
export function BalancePlansPanel({ deviceId, card }: { deviceId: string; card: QueryCardContext }) {
  const { t } = useI18n();
  const [plans, setPlans] = useState<BalancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Record<string, number | null>>({
    balance_query: null,
    renewal_reminder: null,
  });
  const [forms, setForms] = useState<Record<string, PlanForm>>({
    balance_query: emptyForm("balance_query", localTimezone()),
    renewal_reminder: emptyForm("renewal_reminder", localTimezone()),
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<BalancePlan[]>(cardBalancePlansPath(card));
      setPlans(Array.isArray(list) ? list : []);
    } catch (error) {
      message.error(tl("计划加载失败：") + apiMessage(error));
    } finally {
      setLoading(false);
    }
  }, [card]);

  useEffect(() => {
    void load();
  }, [load]);

  function setForm(kind: PlanKind, patch: Partial<PlanForm>) {
    setForms((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
  }

  function startEdit(plan: BalancePlan) {
    const kind = plan.kind as PlanKind;
    setEditing((current) => ({ ...current, [kind]: plan.id }));
    setForm(kind, {
      name: plan.name,
      intervalDays: String(plan.intervalDays),
      startDate: plan.startDate,
      runTime: plan.runTime,
      timezone: plan.timezone,
      enabled: plan.enabled,
      notify: plan.notify,
    });
  }

  function cancelEdit(kind: PlanKind) {
    setEditing((current) => ({ ...current, [kind]: null }));
    setForms((current) => ({ ...current, [kind]: emptyForm(kind, localTimezone()) }));
    setFormErrors((current) => ({ ...current, [kind]: "" }));
  }

  function validate(kind: PlanKind, form: PlanForm): string {
    if (!form.name.trim()) return t("计划名称不能为空");
    const interval = toInt(form.intervalDays);
    if (interval < 1 || interval > 365) return t("间隔天数必须在 1-365 之间");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate.trim())) return t("开始日期必须是 YYYY-MM-DD");
    if (!/^\d{2}:\d{2}$/.test(form.runTime.trim())) return t("执行时间必须是 HH:MM");
    if (!form.timezone.trim()) return t("时区不能为空");
    void kind;
    return "";
  }

  async function save(kind: PlanKind) {
    const form = forms[kind];
    const problem = validate(kind, form);
    setFormErrors((current) => ({ ...current, [kind]: problem }));
    if (problem || saving) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        kind,
        deviceId,
        iccid: card.iccid,
        profileAid: card.profileAid,
        profileName: card.label,
        intervalDays: toInt(form.intervalDays),
        startDate: form.startDate.trim(),
        runTime: form.runTime.trim(),
        timezone: form.timezone.trim(),
        enabled: form.enabled,
        notify: form.notify,
      };
      const id = editing[kind];
      if (id) {
        await api(balancePlanPath(id), { method: "PUT", body });
        message.success(t("计划已更新"));
      } else {
        await api("/query-center/balance-plans", { method: "POST", body });
        message.success(t("计划已创建"));
      }
      cancelEdit(kind);
      await load();
    } catch (error) {
      message.error(tl("计划保存失败：") + apiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(plan: BalancePlan) {
    const ok = await confirmDialog(t("删除后该卡将不再自动执行此计划。"), tl("删除这条计划？"), {
      confirmText: tl("删除"),
      cancelText: tl("取消"),
      type: "warning",
    });
    if (!ok) return;
    try {
      await api(balancePlanPath(plan.id), { method: "DELETE" });
      message.success(t("计划已删除"));
      if (editing[plan.kind as PlanKind] === plan.id) cancelEdit(plan.kind as PlanKind);
      await load();
    } catch (error) {
      message.error(tl("计划删除失败：") + apiMessage(error));
    }
  }

  async function runNow(plan: BalancePlan) {
    try {
      await api(balancePlanRunPath(plan.id), { method: "POST" });
      message.success(tf("已触发「{name}」立即执行一次", { name: plan.name }));
      window.setTimeout(() => void load(), 400);
    } catch (error) {
      message.error(tl("触发失败：") + apiMessage(error));
    }
  }

  function planForm(kind: PlanKind, title: string, description: string) {
    const form = forms[kind];
    const editingId = editing[kind];
    const error = formErrors[kind];
    return (
      <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</span>
          {editingId ? <Tag type="warning">{t("编辑中")}</Tag> : null}
        </div>
        <p className="text-xs text-gray-400">{description}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("计划名称")}</span>
          <Input value={form.name} onChange={(event) => setForm(kind, { name: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("间隔天数（1-365）")}</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.intervalDays}
              onChange={(event) => setForm(kind, { intervalDays: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("开始日期")}</span>
            <Input type="date" value={form.startDate} onChange={(event) => setForm(kind, { startDate: event.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("执行时间")}</span>
            <Input type="time" value={form.runTime} onChange={(event) => setForm(kind, { runTime: event.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("时区（IANA）")}</span>
            <Input
              value={form.timezone}
              placeholder={localTimezone()}
              onChange={(event) => setForm(kind, { timezone: event.target.value })}
            />
          </label>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Switch checked={form.enabled} onChange={(checked) => setForm(kind, { enabled: checked })} />
            {t("启用计划")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Switch checked={form.notify} onChange={(checked) => setForm(kind, { notify: checked })} />
            {t("执行结果推送到已启用渠道")}
          </label>
        </div>
        {error ? <div className="text-xs font-bold text-red-500">{error}</div> : null}
        <div className="flex items-center gap-2">
          <Button size="small" variant="primary" icon={<SaveRegular />} loading={saving} disabled={saving} onClick={() => void save(kind)}>
            {editingId ? t("保存修改") : t("创建计划")}
          </Button>
          {editingId ? (
            <Button size="small" onClick={() => cancelEdit(kind)}>
              {t("取消编辑")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[320px] space-y-5 p-4 sm:p-5">
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t("已有计划")}</div>
        {loading ? (
          <div className="py-2 text-sm text-gray-400">{t("加载中…")}</div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-700">
            {t("当前卡还没有计划，使用下方表单创建")}
          </div>
        ) : (
          <ul className="space-y-2">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{plan.name}</span>
                      <Tag type="info">{t(planKindLabel(plan.kind))}</Tag>
                      {!plan.enabled ? <Tag type="warning">{t("已停用")}</Tag> : null}
                      {plan.lastStatus === "failed" ? <Tag type="danger">{t("上次执行失败")}</Tag> : null}
                      {plan.lastStatus === "success" ? <Tag type="success">{t("上次执行成功")}</Tag> : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {tf("每 {days} 天 · 下次 {next}", { days: plan.intervalDays, next: formatTime(plan.nextRunAt) })}
                      {plan.lastRunAt ? ` · ${t("上次")} ${formatTime(plan.lastRunAt)}` : ""}
                    </div>
                    {plan.lastError ? (
                      <div className="mt-1 truncate text-xs text-red-500" title={plan.lastError}>
                        {plan.lastError}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="small"
                      variant="text"
                      icon={<PlayRegular />}
                      aria-label={t("立即执行一次")}
                      title={t("立即执行一次")}
                      onClick={() => void runNow(plan)}
                    />
                    <Button size="small" variant="text" onClick={() => startEdit(plan)}>
                      {t("编辑")}
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      icon={<DeleteRegular />}
                      aria-label={t("删除")}
                      onClick={() => void remove(plan)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t("新建或编辑计划")}</div>
        {planForm("balance_query", t("余额自动查询"), t("到期后自动切换到目标卡并执行一次余额查询，完成后保持目标卡激活并恢复其网络策略。"))}
        {planForm("renewal_reminder", t("续费提醒"), t("到期后仅发送续费/保号提醒通知，不执行查询，也不切换 Profile。"))}
      </div>
    </div>
  );
}
