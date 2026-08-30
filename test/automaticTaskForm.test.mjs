import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/automaticTaskForm.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { normalizeAutomaticTaskEnvironment, automaticTaskNeedsPhone } = await import(moduleURL);

test("cellular automatic task types always use the direct cellular environment", () => {
  assert.equal(normalizeAutomaticTaskEnvironment("public_ip", "vowifi"), "cellular");
  assert.equal(normalizeAutomaticTaskEnvironment("cellular_attach", "vowifi"), "cellular");
  assert.equal(normalizeAutomaticTaskEnvironment("sms", "vowifi"), "vowifi");
});

test("cellular attach tasks do not require a phone payload", () => {
  assert.equal(automaticTaskNeedsPhone("cellular_attach"), false);
  assert.equal(automaticTaskNeedsPhone("public_ip"), false);
  assert.equal(automaticTaskNeedsPhone("sms"), true);
  assert.equal(automaticTaskNeedsPhone("call"), true);
});
