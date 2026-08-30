import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/phoneNavigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { phonePathForDevice, requestedPhoneDeviceId } = await import(moduleURL);

test("device call navigation preserves the selected device in the phone URL", () => {
  assert.equal(phonePathForDevice("modem/one"), "/phone?device=modem%2Fone");
  assert.equal(requestedPhoneDeviceId("?device=estkme_plus"), "estkme_plus");
});
