import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRegular, ArrowUpRegular, DeleteRegular, OpenRegular, SaveRegular, ArrowClockwiseRegular } from "@fluentui/react-icons";
import { api, apiMessage } from "../../api";
import { cardResourcePath, type QueryCardContext } from "../../lib/queryCenter";
import { tl, useI18n } from "../../lib/i18n";
import { Button, Input, message, Spinner, Tag } from "../ui";
import type { KnowledgeLink, QueryCenterCardResource } from "../../types";

interface ResourceForm {
  rechargeUrl: string;
  renewUrl: string;
  knowledgeLinks: KnowledgeLink[];
}

// toHttpHref 仅在输入可解析且协议为 HTTP/HTTPS 时返回规范化 URL，
// 其余输入（含 javascript: 等危险 scheme）一律返回 null，从源头阻止危险 href。
function toHttpHref(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.host) {
    return null;
  }
  return parsed.href;
}

function isHttpUrl(value: string): boolean {
  return toHttpHref(value) !== null;
}

function fromResource(resource: QueryCenterCardResource): ResourceForm {
  return {
    rechargeUrl: resource.effective.rechargeUrl || "",
    renewUrl: resource.effective.renewUrl || "",
    knowledgeLinks: (resource.effective.knowledgeLinks || []).map((link) => ({ ...link })),
  };
}

// CardLinksPanel 编辑卡资料：充值/续费入口与知识库链接。展示后端返回的
// effective/defaults，保存只写当前 ICCID/Profile 键，恢复默认后立即反映
// 系统默认值；所有状态不落 localStorage。
export function CardLinksPanel({
  deviceId,
  card,
  section,
}: {
  deviceId: string;
  card: QueryCardContext;
  section: "recharge" | "knowledge";
}) {
  const { t } = useI18n();
  const [resource, setResource] = useState<QueryCenterCardResource | null>(null);
  const [form, setForm] = useState<ResourceForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<QueryCenterCardResource>(cardResourcePath(card));
      setResource(data);
      setForm(fromResource(data));
      setValidationError("");
    } catch (error) {
      message.error(tl("卡资料加载失败：") + apiMessage(error));
    } finally {
      setLoading(false);
    }
  }, [card]);

  useEffect(() => {
    void load();
  }, [load]);

  const customized = !!resource?.customized;

  const buildPayload = useCallback(
    (current: ResourceForm) => ({
      profileName: resource?.card.profileName || "",
      carrierMcc: resource?.card.carrierMcc || "",
      carrierMnc: resource?.card.carrierMnc || "",
      carrierSpn: resource?.card.carrierSpn || "",
      rechargeUrl: current.rechargeUrl.trim(),
      renewUrl: current.renewUrl.trim(),
      knowledgeLinks: current.knowledgeLinks.map((link, index) => ({
        id: link.id || `link-${index + 1}`,
        title: link.title.trim(),
        url: link.url.trim(),
        sortOrder: index + 1,
      })),
    }),
    [resource],
  );

  const validate = useCallback(
    (current: ResourceForm): string => {
      if (current.rechargeUrl.trim() && !isHttpUrl(current.rechargeUrl.trim())) {
        return t("充值链接必须是有效的 HTTP(S) 地址");
      }
      if (current.renewUrl.trim() && !isHttpUrl(current.renewUrl.trim())) {
        return t("续费链接必须是有效的 HTTP(S) 地址");
      }
      for (const link of current.knowledgeLinks) {
        if (!link.title.trim()) return t("知识库条目标题不能为空");
        if (!isHttpUrl(link.url.trim())) return t("知识库链接必须是有效的 HTTP(S) 地址");
      }
      return "";
    },
    [t],
  );

  async function save() {
    if (!form || saving) return;
    const problem = validate(form);
    setValidationError(problem);
    if (problem) return;
    setSaving(true);
    try {
      await api<QueryCenterCardResource>(cardResourcePath(card), { method: "PUT", body: buildPayload(form) });
      message.success(t("卡资料已保存"));
      await load();
    } catch (error) {
      message.error(tl("卡资料保存失败：") + apiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    if (saving) return;
    setSaving(true);
    try {
      await api<QueryCenterCardResource>(cardResourcePath(card, "defaults"), { method: "DELETE" });
      message.success(t("已恢复默认卡资料"));
      await load();
    } catch (error) {
      message.error(tl("恢复默认失败：") + apiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    if (!resource || !form) return false;
    const baseline = fromResource(resource);
    return JSON.stringify(baseline) !== JSON.stringify(form);
  }, [resource, form]);

  if (loading || !resource || !form) {
    return (
      <div className="flex items-center justify-center p-10">
        <Spinner className="h-6 w-6 text-[#0ea5e9]" />
      </div>
    );
  }

  const rechargeHref = toHttpHref(form.rechargeUrl.trim());
  const renewHref = toHttpHref(form.renewUrl.trim());

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <Tag type={customized ? "primary" : "info"}>{customized ? t("自定义配置") : t("系统默认")}</Tag>
        <div className="flex items-center gap-2">
          {customized ? (
            <Button size="small" icon={<ArrowClockwiseRegular />} disabled={saving} onClick={() => void resetDefaults()}>
              {t("恢复默认")}
            </Button>
          ) : null}
          <Button size="small" variant="primary" icon={<SaveRegular />} loading={saving} disabled={saving || !dirty} onClick={() => void save()}>
            {t("保存")}
          </Button>
        </div>
      </div>

      {validationError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {validationError}
        </div>
      ) : null}

      {section === "recharge" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700 dark:text-gray-200">{t("充值链接")}</span>
            <div className="flex items-center gap-2">
              <Input
                value={form.rechargeUrl}
                placeholder="https://"
                onChange={(event) => setForm({ ...form, rechargeUrl: event.target.value })}
              />
              {rechargeHref ? (
                <a
                  // codeql[js/xss-through-dom]: rechargeHref 经 toHttpHref 协议白名单校验，仅 HTTP/HTTPS 可达
                  href={rechargeHref}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={t("打开充值链接")}
                  title={t("打开充值链接")}
                  className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                  <OpenRegular className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700 dark:text-gray-200">{t("续费链接")}</span>
            <div className="flex items-center gap-2">
              <Input
                value={form.renewUrl}
                placeholder="https://"
                onChange={(event) => setForm({ ...form, renewUrl: event.target.value })}
              />
              {renewHref ? (
                <a
                  // codeql[js/xss-through-dom]: renewHref 经 toHttpHref 协议白名单校验，仅 HTTP/HTTPS 可达
                  href={renewHref}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={t("打开续费链接")}
                  title={t("打开续费链接")}
                  className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                  <OpenRegular className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          {form.knowledgeLinks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-700">
              {t("暂无知识库链接，点击下方按钮新增")}
            </div>
          ) : (
            form.knowledgeLinks.map((link, index) => {
              const linkHref = toHttpHref(link.url.trim());
              return (
              <div key={index} className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Input
                    value={link.title}
                    placeholder={t("标题")}
                    onChange={(event) => {
                      const next = [...form.knowledgeLinks];
                      next[index] = { ...link, title: event.target.value };
                      setForm({ ...form, knowledgeLinks: next });
                    }}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="small"
                      variant="text"
                      icon={<ArrowUpRegular />}
                      disabled={index === 0}
                      aria-label={t("上移")}
                      onClick={() => {
                        const next = [...form.knowledgeLinks];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setForm({ ...form, knowledgeLinks: next });
                      }}
                    />
                    <Button
                      size="small"
                      variant="text"
                      icon={<ArrowDownRegular />}
                      disabled={index === form.knowledgeLinks.length - 1}
                      aria-label={t("下移")}
                      onClick={() => {
                        const next = [...form.knowledgeLinks];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setForm({ ...form, knowledgeLinks: next });
                      }}
                    />
                    <Button
                      size="small"
                      variant="text"
                      icon={<DeleteRegular />}
                      aria-label={t("删除")}
                      onClick={() => setForm({ ...form, knowledgeLinks: form.knowledgeLinks.filter((_, i) => i !== index) })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={link.url}
                    placeholder="https://"
                    onChange={(event) => {
                      const next = [...form.knowledgeLinks];
                      next[index] = { ...link, url: event.target.value };
                      setForm({ ...form, knowledgeLinks: next });
                    }}
                  />
                  {linkHref ? (
                    <a
                      // codeql[js/xss-through-dom]: linkHref 经 toHttpHref 协议白名单校验，仅 HTTP/HTTPS 可达
                      href={linkHref}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={t("打开链接")}
                      title={t("打开链接")}
                      className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    >
                      <OpenRegular className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
              );
            })
          )}
          <Button
            size="small"
            onClick={() =>
              setForm({
                ...form,
                knowledgeLinks: [...form.knowledgeLinks, { id: "", title: "", url: "", sortOrder: form.knowledgeLinks.length + 1 }],
              })
            }
          >
            {t("新增知识库链接")}
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-400">
        {t("设备")}: {deviceId} · {t("配置按 ICCID/Profile 保存，仅影响当前卡")}
      </p>
    </div>
  );
}
