import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/devices/cardPolicyPresentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { hasEsimConfiguration } = await import(moduleURL);

test("detects an eSIM chip even when it has no downloaded profiles", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: { eids: [] }, profiles: [] }), true);
});

test("detects eSIM configuration from installed profiles", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: null, profiles: [{ profiles: [{ iccid: "8900000000000000001" }] }] }), true);
});

test("keeps the physical SIM card policy when no eSIM is available", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: null, profiles: [] }), false);
});
