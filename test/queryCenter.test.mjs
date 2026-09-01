import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTS(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
  return import(moduleURL);
}

test("builds profile-aware query center API paths", async () => {
  const {
    buildCardContextKey,
    queryCenterBalancePlansPath,
    queryCenterBalanceQueriesPath,
    queryCenterCardResourcePath,
  } = await importTS("src/lib/queryCenter.ts");

  assert.equal(buildCardContextKey({ deviceId: "dev1", iccid: "8986001", profileAid: "" }), "dev1:8986001:");
  assert.equal(buildCardContextKey({ deviceId: "dev1", iccid: "8986001", profileAid: "A0000001" }), "dev1:8986001:A0000001");
  assert.equal(queryCenterCardResourcePath("8986001", "A0000001"), "/query-center/cards/8986001?profile_aid=A0000001");
  assert.equal(queryCenterBalanceQueriesPath("8986001", ""), "/query-center/balance-queries?iccid=8986001");
  assert.equal(queryCenterBalancePlansPath("8986001", "A0000001"), "/query-center/balance-plans?iccid=8986001&profile_aid=A0000001");
});

test("query center page keeps the right rail placeholder stable and centered", async () => {
  const source = await readFile(new URL("../src/pages/QueryCenterPage.tsx", import.meta.url), "utf8");

  assert.match(source, /title=\{t\("查询中心"\)\}/);
  assert.match(source, /t\("余额"\)/);
  assert.match(source, /t\("充值续费"\)/);
  assert.match(source, /query-center-context-card/);
  assert.match(source, /min-h-\[136px\]/);
  assert.match(source, /请选择左侧的卡或 Profile/);
  assert.match(source, /flex flex-1 items-center justify-center p-6/);
});
