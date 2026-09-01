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
const policySource = await readFile(new URL("../src/components/devices/EsimCardPolicyInline.tsx", import.meta.url), "utf8");
const cardPolicySource = await readFile(new URL("../src/components/devices/CardPolicyPanel.tsx", import.meta.url), "utf8");

test("detects an eSIM chip even when it has no downloaded profiles", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: { eids: [] }, profiles: [] }), true);
});

test("detects eSIM configuration from installed profiles", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: null, profiles: [{ profiles: [{ iccid: "8900000000000000001" }] }] }), true);
});

test("keeps the physical SIM card policy when no eSIM is available", () => {
  assert.equal(hasEsimConfiguration({ chipInfo: null, profiles: [] }), false);
});

test("renders custom phone editing inside each eSIM profile policy", () => {
  assert.match(policySource, /customPhoneNumber/);
  assert.match(policySource, /updateCardPolicy\(iccid/);
  assert.match(policySource, /自定义手机号/);
});

test("hides the top-level custom phone editor when eSIM profiles are detected", () => {
  assert.match(cardPolicySource, /!esimDetected\s*\?/);
  assert.match(cardPolicySource, /自定义手机号/);
});

test("does not render a manual source badge beside the current ICCID", () => {
  assert.doesNotMatch(cardPolicySource, /sourceLabel/);
  assert.doesNotMatch(cardPolicySource, /手动设置/);
});
