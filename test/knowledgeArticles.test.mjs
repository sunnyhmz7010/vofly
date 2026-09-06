import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// 知识库即 knowledge/ 目录：文件名是文章标题，内容直接渲染。
// 用源码守卫锁定装载约定与内容底线。
const dir = new URL("../knowledge/", import.meta.url);

test("knowledge folder ships markdown articles with filename titles", async () => {
  const entries = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".md"));
  assert.ok(entries.length >= 5, "knowledge base should ship several articles");
  const titles = new Set();
  for (const name of entries) {
    const title = name.replace(/\.md$/i, "");
    assert.ok(!titles.has(title), `duplicate article title ${title}`);
    titles.add(title);
    const content = await readFile(new URL(name, dir), "utf8");
    assert.ok(content.trim(), `article ${title} content is required`);
  }
});

test("knowledge base covers the split features and new task types", async () => {
  const entries = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".md"));
  const combined = (
    await Promise.all(entries.map((name) => readFile(new URL(name, dir), "utf8")))
  ).join("\n");
  for (const keyword of ["余额自动查询", "续费提醒", "余额变动历史", "自动任务", "VoWiFi", "USB SIM 读卡器"]) {
    assert.ok(combined.includes(keyword), `knowledge base should mention ${keyword}`);
  }
});
