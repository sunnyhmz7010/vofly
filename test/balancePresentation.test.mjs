import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/balancePresentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { balanceChangeTag, balanceStateTag, balanceChangeText } = await import(moduleURL);

test("balance change tags map parsed directions", () => {
  assert.equal(balanceChangeTag({ changeDirection: "increase" }), "increase");
  assert.equal(balanceChangeTag({ changeDirection: "decrease" }), "decrease");
  assert.equal(balanceChangeTag({ changeDirection: "unchanged" }), "unchanged");
  assert.equal(balanceChangeTag({ changeDirection: "" }), "unknown");
  assert.equal(balanceChangeTag({}), "unknown");
  assert.equal(balanceChangeTag({ changeDirection: "decrease", changeAmount: "-2.50" }), "decrease");
});

test("balance state tags map every query state", () => {
  assert.deepEqual(balanceStateTag("completed"), { text: "已完成", type: "success" });
  assert.deepEqual(balanceStateTag("failed"), { text: "失败", type: "danger" });
  assert.deepEqual(balanceStateTag("timed_out"), { text: "已超时", type: "warning" });
  assert.deepEqual(balanceStateTag("awaiting_reply"), { text: "等待回复", type: "warning" });
  assert.deepEqual(balanceStateTag("sending"), { text: "发送中", type: "info" });
  assert.deepEqual(balanceStateTag("unknown_state"), { text: "发送中", type: "info" });
});

test("balance change text keeps amounts and never invents a direction", () => {
  const t = (key) => key;
  assert.equal(balanceChangeText({ changeDirection: "increase", changeAmount: "1.00" }, t), "较上次增加 1.00");
  assert.equal(balanceChangeText({ changeDirection: "decrease", changeAmount: "-2.50" }, t), "较上次减少 -2.50");
  assert.equal(balanceChangeText({ changeDirection: "increase", changeAmount: "" }, t), "较上次增加");
  assert.equal(balanceChangeText({ changeDirection: "unchanged", changeAmount: "" }, t), "余额无变化");
  assert.equal(balanceChangeText({ changeDirection: "", changeAmount: "9.99" }, t), "");
  assert.equal(balanceChangeText({}, t), "");
});
