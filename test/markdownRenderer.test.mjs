import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Markdown 渲染器是外部内容（GitHub Release notes、知识库文章）进入页面的
// 唯一边界，用源码守卫锁定安全约束与能力范围。
const source = await readFile(new URL("../src/components/ui/Markdown.tsx", import.meta.url), "utf8");

test("markdown renderer never injects raw HTML", () => {
  assert.ok(!source.includes("dangerouslySetInnerHTML"), "must not use dangerouslySetInnerHTML");
  assert.ok(!source.includes("innerHTML"), "must not touch innerHTML");
});

test("markdown renderer whitelists http(s) links only", () => {
  assert.ok(source.includes('protocol === "https:" || parsed.protocol === "http:"'), "href protocol whitelist missing");
  assert.ok(source.includes('rel="noopener noreferrer nofollow"'), "external link rel missing");
});

test("markdown renderer covers release notes and knowledge base needs", () => {
  // 标题、列表、代码块、加粗、行内代码、链接均在能力范围内
  const snippets = ["renderInline", 'startsWith("**")', "list-decimal", "list-disc", "<code>"];
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `markdown renderer should support ${snippet}`);
  }
});
