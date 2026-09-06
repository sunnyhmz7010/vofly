import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/knowledgeArticles.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { KNOWLEDGE_ARTICLES } = await import(moduleURL);

test("knowledge base articles are complete and unique", () => {
  assert.ok(KNOWLEDGE_ARTICLES.length >= 5, "knowledge base should ship several articles");
  const ids = new Set();
  for (const article of KNOWLEDGE_ARTICLES) {
    assert.ok(article.id.trim(), "article id is required");
    assert.ok(!ids.has(article.id), `duplicate article id ${article.id}`);
    ids.add(article.id);
    assert.ok(article.title.trim(), `article ${article.id} title is required`);
    assert.ok(article.content.trim(), `article ${article.id} content is required`);
  }
});

test("knowledge base covers the split features and new task types", () => {
  const combined = KNOWLEDGE_ARTICLES.map((article) => `${article.title}\n${article.content}`).join("\n");
  for (const keyword of ["余额自动查询", "续费提醒", "余额变动历史", "自动任务", "VoWiFi", "USB SIM 读卡器"]) {
    assert.ok(combined.includes(keyword), `knowledge base should mention ${keyword}`);
  }
});
