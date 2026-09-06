import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { EmptyState, Markdown, PageHeader } from "../components/ui";
import { KNOWLEDGE_ARTICLES } from "../lib/knowledgeArticles";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/utils";

const MOBILE_BREAKPOINT = 980;

// KnowledgeBasePage 是纯前端知识库：左侧文章标题、右侧正文；未选择时居中
// 提示（同短信页）。移动端逐栏进入，带返回按钮。
export default function KnowledgeBasePage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [width, setWidth] = useState(0);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const isDesktop = width === 0 || width >= MOBILE_BREAKPOINT;
  const selectedId = searchParams.get("article") || "";
  const article = useMemo(
    () => KNOWLEDGE_ARTICLES.find((item) => item.id === selectedId) || null,
    [selectedId],
  );

  // 移动端逐栏进入：未选择文章时显示列表，选中后进入正文。
  const showListColumn = isDesktop || !article;
  const showDetailColumn = isDesktop || !!article;

  function selectArticle(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("article", id);
      else next.delete("article");
      return next;
    });
  }

  useEffect(() => {
    const measure = () => setWidth(pageRef.current?.clientWidth || 0);
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && pageRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(pageRef.current);
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={pageRef} className="flex h-[calc(100vh-140px)] flex-col">
      <PageHeader title={t("知识库")} />
      <div className="relative flex-1 overflow-hidden ui-card">
        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          {showListColumn ? (
            <div
              className={cx(
                "flex min-h-0 flex-col",
                isDesktop && "border-r border-gray-100 dark:border-white/10",
              )}
            >
              <div className="border-b border-gray-100 p-4 dark:border-white/10">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("文章")}</div>
              </div>
              <div className="space-y-1 overflow-auto p-3">
                {KNOWLEDGE_ARTICLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectArticle(item.id)}
                    className={cx(
                      "w-full truncate rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-all",
                      item.id === selectedId
                        ? "border-indigo-200 bg-indigo-50/70 text-gray-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-gray-100"
                        : "border-transparent text-gray-800 hover:bg-gray-50/60 dark:text-gray-100 dark:hover:bg-white/5",
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showDetailColumn ? (
            <div className="flex min-h-0 flex-col">
              {article ? (
                <>
                  <div className="border-b border-gray-100 p-4 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      {!isDesktop ? (
                        <button
                          type="button"
                          aria-label={t("返回")}
                          onClick={() => selectArticle("")}
                          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        >
                          <ArrowLeftRegular className="h-4 w-4" />
                        </button>
                      ) : null}
                      <h2 className="min-w-0 truncate text-base font-bold text-gray-900 dark:text-gray-100">
                        {article.title}
                      </h2>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-5">
                    <div className="mx-auto max-w-3xl">
                      <Markdown content={article.content} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="knowledge-empty-state flex flex-1 items-center justify-center p-6">
                  <EmptyState title={t("请选择左侧的知识库文章")} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
