import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("knowledge base page keeps a two-column layout with a centered empty state", async () => {
  const page = await source("src/pages/KnowledgeBasePage.tsx");

  // 左栏文章列表 + 右栏正文的栅格布局
  assert.match(page, /md:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  // 未选择文章时居中提示（同短信页模式）
  assert.match(page, /knowledge-empty-state flex flex-1 items-center justify-center p-6/);
  assert.match(page, /EmptyState title=\{t\("请选择左侧的知识库文章"\)\}/);
  // 移动端逐栏进入
  assert.match(page, /showListColumn/);
  assert.match(page, /showDetailColumn/);
});

test("knowledge base replaces the query center route and navigation", async () => {
  const app = await source("src/App.tsx");
  const shell = await source("src/components/shell/AuthenticatedShell.tsx");

  assert.match(app, /path="knowledge" element=\{<KnowledgeBasePage \/>\}/);
  // 不保留旧入口兼容跳转，全新安装直接使用新路由
  assert.doesNotMatch(app, /query-center|"commands"/);
  assert.doesNotMatch(app, /QueryCenterPage/);
  assert.match(shell, /\{ to: "\/knowledge", label: "知识库", icon: BookRegular \}/);
  assert.doesNotMatch(shell, /query-center|查询中心/);
});
