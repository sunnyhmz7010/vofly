import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/queryCenter.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  cardKey,
  isEsimCard,
  effectiveCardResource,
  balanceChangeTag,
  planKindLabel,
  cardQueryString,
  cardResourcePath,
  cardBalanceQueriesPath,
  cardBalancePlansPath,
  balancePlanPath,
  balancePlanRunPath,
  buildCardContexts,
} = await import(moduleURL);

test("query-center card keys distinguish physical SIM from eSIM AIDs", () => {
  const physical = { iccid: "89860123456789012345", profileAid: "" };
  const esimOne = { iccid: "89860123456789012345", profileAid: "aid-1" };
  const esimTwo = { iccid: "89860123456789012345", profileAid: "aid-2" };

  assert.equal(cardKey(physical), "89860123456789012345");
  assert.notEqual(cardKey(esimOne), cardKey(physical));
  assert.notEqual(cardKey(esimOne), cardKey(esimTwo));
  assert.equal(isEsimCard(physical), false);
  assert.equal(isEsimCard(esimOne), true);
});

test("query-center effective resources replace defaults only with custom data", () => {
  const defaults = {
    rechargeUrl: "https://www.redpocket.com/",
    renewUrl: "",
    knowledgeLinks: [{ id: "guide", title: "官方指南", url: "https://www.redpocket.com/guide", sortOrder: 1 }],
  };
  const custom = {
    rechargeUrl: "https://custom.example/recharge",
    renewUrl: "https://custom.example/renew",
    knowledgeLinks: [{ id: "faq", title: "FAQ", url: "https://custom.example/faq", sortOrder: 1 }],
  };

  // 自定义数据整体替换默认值
  assert.deepEqual(effectiveCardResource(custom, defaults, true), custom);
  // 未自定义时返回默认值
  assert.deepEqual(effectiveCardResource(custom, defaults, false), defaults);
  // 恢复默认（无自定义数据）后立即反映默认值
  assert.deepEqual(effectiveCardResource(null, defaults, false), defaults);
});

test("query-center balance change tags map parsed directions", () => {
  assert.equal(balanceChangeTag({ changeDirection: "increase" }), "increase");
  assert.equal(balanceChangeTag({ changeDirection: "decrease" }), "decrease");
  assert.equal(balanceChangeTag({ changeDirection: "unchanged" }), "unchanged");
  assert.equal(balanceChangeTag({ changeDirection: "" }), "unknown");
  assert.equal(balanceChangeTag({}), "unknown");
  assert.equal(balanceChangeTag({ changeDirection: "decrease", changeAmount: "-2.50" }), "decrease");
});

test("query-center plan kind labels stay human readable", () => {
  assert.equal(planKindLabel("balance_query"), "余额自动查询");
  assert.equal(planKindLabel("renewal_reminder"), "续费提醒");
  assert.equal(planKindLabel("unknown_kind"), "未知计划");
});

test("query-center URL builders centralize card query strings", () => {
  const physical = { iccid: "89860 1", profileAid: "" };
  const esim = { iccid: "898601", profileAid: "aid/1" };

  assert.equal(cardQueryString(physical), "iccid=89860+1");
  assert.equal(cardQueryString(esim), "iccid=898601&profile_aid=aid%2F1");
  // 路径段按 encodeURIComponent 编码（空格为 %20），查询串按表单编码（空格为 +）
  assert.equal(cardResourcePath(physical), "/query-center/cards/89860%201");
  assert.equal(cardResourcePath(esim, "defaults"), "/query-center/cards/898601/defaults?profile_aid=aid%2F1");
  assert.equal(
    cardBalanceQueriesPath(esim),
    "/query-center/balance-queries?iccid=898601&profile_aid=aid%2F1",
  );
  assert.equal(
    cardBalancePlansPath(physical),
    "/query-center/balance-plans?iccid=89860+1",
  );
  assert.equal(balancePlanPath(7), "/query-center/balance-plans/7");
  assert.equal(balancePlanRunPath(7), "/query-center/balance-plans/7/run");
});

test("query-center builds card contexts from eSIM inventory with physical fallback", () => {
  const groups = [
    {
      eid: "89040000000000000000000000000001",
      aidHex: "isdr-1",
      profiles: [
        { iccid: "89860123456789012345", name: "日常卡", state: 1 },
        { iccid: "89860987654321098765", serviceProviderName: "Red Pocket", state: 0 },
      ],
    },
  ];
  const contexts = buildCardContexts("dev1", "89860123456789012345", groups);

  // 两个 Profile 两个上下文，激活卡已出现则不补实体卡
  assert.equal(contexts.length, 2);
  assert.deepEqual(
    contexts.map((c) => [c.iccid, c.profileAid, c.active]),
    [
      ["89860123456789012345", "isdr-1", true],
      ["89860987654321098765", "isdr-1", false],
    ],
  );
  assert.equal(contexts[0].label, "日常卡");
  assert.equal(contexts[1].label, "Red Pocket");
  assert.equal(contexts[0].eid, "89040000000000000000000000000001");

  // 清单读取失败（groups 为空）时以当前激活卡兜底一个实体卡上下文
  const fallback = buildCardContexts("dev1", "89860123456789012345", []);
  assert.deepEqual(
    fallback.map((c) => [c.iccid, c.profileAid, c.label, c.active]),
    [["89860123456789012345", "", "实体卡", true]],
  );

  // 实体 SIM 设备同样得到实体卡上下文
  const physical = buildCardContexts("dev1", "89860123456789012345", []);
  assert.equal(physical[0].profileAid, "");
});
