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
const { isCardPolicyModeDisabled } = await import(moduleURL);

test("blocks enabling roaming data while VoWiFi or airplane mode is enabled", () => {
  assert.equal(isCardPolicyModeDisabled("network", { networkEnabled: false, vowifiEnabled: true, airplaneEnabled: true }), true);
  assert.equal(isCardPolicyModeDisabled("network", { networkEnabled: false, vowifiEnabled: false, airplaneEnabled: true }), true);
});

test("blocks enabling VoWiFi or airplane mode while roaming data is enabled", () => {
  assert.equal(isCardPolicyModeDisabled("vowifi", { networkEnabled: true, vowifiEnabled: false, airplaneEnabled: false }), true);
  assert.equal(isCardPolicyModeDisabled("airplane", { networkEnabled: true, vowifiEnabled: false, airplaneEnabled: false }), true);
});

test("keeps safe ways to turn off a currently enabled mode", () => {
  assert.equal(isCardPolicyModeDisabled("network", { networkEnabled: true, vowifiEnabled: true, airplaneEnabled: true }), false);
  assert.equal(isCardPolicyModeDisabled("vowifi", { networkEnabled: true, vowifiEnabled: true, airplaneEnabled: true }), false);
  assert.equal(isCardPolicyModeDisabled("airplane", { networkEnabled: true, vowifiEnabled: false, airplaneEnabled: true }), false);
});
