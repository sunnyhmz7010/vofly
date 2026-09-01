import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/QueryCenterPage.tsx", import.meta.url), "utf8");

test("query center keeps a fixed-height summary card and centered empty state", () => {
  assert.match(source, /query-center-summary-card/);
  assert.match(source, /query-center-empty-state/);
  assert.match(source, /items-center justify-center p-6/);
  assert.doesNotMatch(source, /items-end justify-center p-6/);
  assert.doesNotMatch(source, /EmptyState title=\{t\("请选择左侧的卡或 Profile"\)\}/);
});
