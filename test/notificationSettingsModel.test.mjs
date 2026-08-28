import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/settings/model.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  DEFAULT_LARK_PAYLOAD_TEMPLATE,
  buildQQPayload,
  buildLarkPayload,
  buildNotificationsPayload,
  buildWeComBotPayload,
  buildWeixinPayload,
  formsFromNotifications,
} = await import(moduleURL);

test("loads a masked signed Lark group bot config", () => {
  const forms = formsFromNotifications({
    lark: {
      enabled: true,
      url: "********",
      signingEnabled: true,
      secret: "********",
      payloadTemplate: '{"msg_type":"text"}',
    },
  });

  assert.deepEqual(forms.lark, {
    enabled: true,
    url: "********",
    signingEnabled: true,
    secret: "********",
    payloadTemplate: '{"msg_type":"text"}',
  });
});

test("does not expose a dormant signing secret when signing is disabled", () => {
  const forms = formsFromNotifications({
    lark: {
      enabled: true,
      url: "********",
      signingEnabled: false,
      secret: "********",
    },
  });

  assert.equal(forms.lark.secret, "");
  assert.equal(forms.lark.payloadTemplate, DEFAULT_LARK_PAYLOAD_TEMPLATE);
});

test("builds the single group bot webhook contract", () => {
  const signed = buildLarkPayload({
    enabled: true,
    url: "  https://open.larksuite.com/open-apis/bot/v2/hook/token  ",
    signingEnabled: true,
    secret: "demo",
    payloadTemplate: '{"msg_type":"text"}',
  }, true);
  assert.deepEqual(signed, {
    enabled: true,
    url: "https://open.larksuite.com/open-apis/bot/v2/hook/token",
    signing_enabled: true,
    secret: "demo",
    payload_template: '{"msg_type":"text"}',
  });

  const unsigned = buildLarkPayload({
    enabled: false,
    url: "",
    signingEnabled: false,
    secret: "stale-secret",
    payloadTemplate: DEFAULT_LARK_PAYLOAD_TEMPLATE,
  });
  assert.equal(Object.hasOwn(unsigned, "url"), false);
  assert.equal(Object.hasOwn(unsigned, "secret"), false);
});

test("includes Lark in the complete notification settings payload", () => {
  const forms = formsFromNotifications({});
  const payload = buildNotificationsPayload(forms);

  assert.deepEqual(payload.lark, {
    enabled: false,
    signing_enabled: false,
    payload_template: DEFAULT_LARK_PAYLOAD_TEMPLATE,
  });
});

test("loads interactive bot notification forms", () => {
  const forms = formsFromNotifications({
    qq: {
      enabled: true,
      appId: "qq-app",
      appSecret: "********",
      groupIds: "group-openid",
      directIds: "direct-openid",
    },
    weixin: {
      enabled: true,
      baseUrl: "https://ilinkai.weixin.qq.com",
      allowedUserIds: ["wx-user"],
      allowedGroupIds: ["wx-group"],
    },
    wecomBot: {
      enabled: true,
      botId: "bot-id",
      secret: "********",
      websocketUrl: "wss://openws.work.weixin.qq.com",
      allowedUserIds: ["wecom-user"],
      allowedGroupIds: ["wecom-group"],
    },
  });

  assert.deepEqual(forms.qq, {
    enabled: true,
    appId: "qq-app",
    appSecret: "********",
    groupIds: "group-openid",
    directIds: "direct-openid",
  });
  assert.equal(forms.weixin.allowedUserIds, "wx-user");
  assert.equal(forms.weixin.allowedGroupIds, "wx-group");
  assert.equal(forms.wecomBot.secret, "********");
});

test("builds interactive bot notification payloads", () => {
  assert.deepEqual(buildQQPayload({
    enabled: true,
    appId: " qq-app ",
    appSecret: "secret",
    groupIds: " group ",
    directIds: " direct ",
  }), {
    enabled: true,
    app_id: " qq-app ",
    app_secret: "secret",
    group_ids: " group ",
    direct_ids: " direct ",
  });
  assert.deepEqual(buildWeixinPayload({
    enabled: true,
    baseUrl: " https://ilinkai.weixin.qq.com ",
    allowedUserIds: " wx-user, wx-user-2 ",
    allowedGroupIds: " wx-group ",
  }), {
    enabled: true,
    base_url: " https://ilinkai.weixin.qq.com ",
    allowed_user_ids: ["wx-user", "wx-user-2"],
    allowed_group_ids: ["wx-group"],
  });
  assert.deepEqual(buildWeComBotPayload({
    enabled: true,
    botId: "bot-id",
    secret: "secret",
    websocketUrl: "wss://openws.work.weixin.qq.com",
    allowedUserIds: "wecom-user",
    allowedGroupIds: "wecom-group",
  }), {
    enabled: true,
    bot_id: "bot-id",
    secret: "secret",
    websocket_url: "wss://openws.work.weixin.qq.com",
    allowed_user_ids: ["wecom-user"],
    allowed_group_ids: ["wecom-group"],
  });
});
