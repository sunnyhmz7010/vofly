import type { ReactNode } from "react";
import { cx } from "../../lib/utils";

// Markdown 轻量渲染器：只支持受控的安全子集（标题、无序/有序列表、代码块、
// 行内代码、加粗、HTTP(S) 链接、段落），其余内容按纯文本转义展示。
// 更新说明与知识库共用；外部内容（GitHub Release notes）不可信，
// 永不注入原始 HTML（无 dangerously-set-inner-html 类调用），链接协议白名单见 isSafeHref。

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !!parsed.host;
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    cursor = start + token.length;
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-b-${start}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${start}`}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token);
      const label = linkMatch?.[1] || "";
      const href = linkMatch?.[2] || "";
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${start}`}
            // 链接经 isSafeHref 协议白名单校验，仅 HTTP/HTTPS 可达
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-indigo-500 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-600 dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    }
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// Markdown 把 markdown 文本渲染为 React 节点；className 用于外层容器。
export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: { lang: string; lines: string[] } | null = null;
  let blockKey = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blockKey++}`} className="whitespace-pre-wrap leading-relaxed">
        {renderInline(paragraph.join("\n"), `p-${blockKey}`)}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    const items = list.items;
    blocks.push(
      list.ordered ? (
        <ol key={`ol-${blockKey++}`} className="list-inside list-decimal space-y-1 leading-relaxed">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item, `oli-${blockKey}-${index}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`ul-${blockKey++}`} className="list-inside list-disc space-y-1 leading-relaxed">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item, `uli-${blockKey}-${index}`)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (code) {
      if (/^```/.test(line.trim())) {
        blocks.push(
          <pre
            key={`pre-${blockKey++}`}
            className="overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-xs leading-relaxed dark:bg-white/10"
          >
            <code>{code.lines.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        code.lines.push(rawLine);
      }
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushAll();
      code = { lang: line.trim().slice(3).trim(), lines: [] };
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const text = renderInline(heading[2].trim(), `h-${blockKey}`);
      const classes: Record<number, string> = {
        1: "text-lg font-bold",
        2: "text-base font-bold",
        3: "text-sm font-bold",
        4: "text-sm font-semibold",
      };
      blocks.push(
        <div key={`h-${blockKey++}`} className={cx("mt-1 text-gray-900 dark:text-gray-100", classes[level])}>
          {text}
        </div>,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1].trim());
      continue;
    }
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1].trim());
      continue;
    }
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (code) {
    blocks.push(
      <pre
        key={`pre-${blockKey++}`}
        className="overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-xs leading-relaxed dark:bg-white/10"
      >
        <code>{code.lines.join("\n")}</code>
      </pre>,
    );
  }
  flushAll();

  return <div className={cx("space-y-3 text-sm text-gray-600 dark:text-gray-300", className)}>{blocks}</div>;
}
