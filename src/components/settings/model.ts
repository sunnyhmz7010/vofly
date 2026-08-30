import type { NotificationSettings } from "../../types";

// ---- 页面专属表单类型（camelCase，对应参考里的各 channel 表单） ----

export interface TelegramForm {
  enabled: boolean;
  botToken: string;
  chatId: string;
  adminId: string;
  baseUrl: string;
  proxy: string;
  // 录音展示模式：voice=语音气泡（默认），audio=音频卡片
  recordingMode: string;
}

export interface QQForm {
  enabled: boolean;
  appId: string;
  appSecret: string;
  groupIds: string;
  directIds: string;
}

export interface WeixinForm {
  enabled: boolean;
  baseUrl: string;
  allowedUserIds: string;
  allowedGroupIds: string;
}

export interface WeComBotForm {
  enabled: boolean;
  botId: string;
  secret: string;
  websocketUrl: string;
  allowedUserIds: string;
  allowedGroupIds: string;
}

export interface FeishuBotForm {
  enabled: boolean;
  appId: string;
  appSecret: string;
  // feishu=国内飞书，lark=国际版 Lark
  domain: string;
  allowedUserIds: string;
  allowedGroupIds: string;
}

export interface HeaderRow {
  id: number;
  key: string;
  value: string;
}

export interface WebhookForm {
  enabled: boolean;
  urls: string[];
  secret: string;
  timeoutMs: number;
  retryMax: number;
  textTemplate: string;
  headers: HeaderRow[];
}

export interface BarkForm {
  enabled: boolean;
  urls: string[];
  group: string;
  icon: string;
  level: string;
}

export interface EmailForm {
  enabled: boolean;
  useSsl: boolean;
  smtpHost: string;
  smtpPort: string;
  username: string;
  password: string;
  fromAddress: string;
  toAddresses: string; // 逗号分隔
}

export interface PushplusForm {
	enabled: boolean;
	token: string;
	topic: string;
	channel: string;
}

export interface WecomForm {
	enabled: boolean;
	urls: string[];
	payloadTemplate: string;
}

export interface LarkForm {
	enabled: boolean;
	url: string;
	signingEnabled: boolean;
	secret: string;
	payloadTemplate: string;
}

export interface MeoWForm {
	enabled: boolean;
	nickname: string;
}

export const DEFAULT_WECOM_PAYLOAD_TEMPLATE = `{
  "msgtype": "text",
  "text": {
    "content": {{message}}
  }
}`;

export const DEFAULT_LARK_PAYLOAD_TEMPLATE = `{
  "msg_type": "text",
  "content": {
    "text": {{message}}
  }
}`;

export interface NotifyForms {
  telegram: TelegramForm;
  qq: QQForm;
  weixin: WeixinForm;
  wecomBot: WeComBotForm;
  feishuBot: FeishuBotForm;
  webhook: WebhookForm;
  bark: BarkForm;
	email: EmailForm;
	pushplus: PushplusForm;
	wecom: WecomForm;
	lark: LarkForm;
	meow: MeoWForm;
}

// 系统保留头，自定义同名头会被忽略（品牌 vofly）
export const RESERVED_HEADERS = new Set(["content-type", "x-vofly-signature"]);

export const HEADER_NAME_SUGGESTIONS = [
  "Authorization",
  "X-Api-Key",
  "X-Auth-Token",
  "X-Webhook-Token",
  "X-Signature",
  "X-Request-Id",
  "Accept",
  "User-Agent",
];

let headerRowSeq = 0;

export function nextHeaderRowId() {
  headerRowSeq += 1;
  return headerRowSeq;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function recordToHeaderRows(raw: unknown): HeaderRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    id: nextHeaderRowId(),
    key,
    value: value === null || value === undefined ? "" : String(value),
  }));
}

export function headerRowsToRecord(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key || RESERVED_HEADERS.has(key.toLowerCase())) continue;
    out[key] = String(row.value ?? "");
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join(",") : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function defaultNotifyForms(): NotifyForms {
  return formsFromNotifications({});
}

export function formsFromNotifications(data: Partial<NotificationSettings>): NotifyForms {
  const telegram = asRecord(data.telegram);
  const qq = asRecord(data.qq);
  const weixin = asRecord(data.weixin);
  const wecomBot = asRecord(data.wecomBot ?? data.wecom_bot);
  const feishuBot = asRecord(data.feishuBot ?? data.feishu_bot);
  const webhook = asRecord(data.webhook);
  const bark = asRecord(data.bark);
	const email = asRecord(data.email);
	const pushplus = asRecord(data.pushplus);
	const wecom = asRecord(data.wecom);
	const lark = asRecord(data.lark);
	const meow = asRecord(data.meow);
  return {
    telegram: {
      enabled: !!telegram.enabled,
      botToken: str(telegram.botToken),
      chatId: telegram.chatId === null || telegram.chatId === undefined ? "" : String(telegram.chatId),
      adminId: telegram.adminId === null || telegram.adminId === undefined ? "" : String(telegram.adminId),
      baseUrl: str(telegram.baseUrl),
      proxy: str(telegram.proxy),
      // 未配置时默认语音气泡；仅保留后端校验的 voice/audio 两个值。
      recordingMode: str(telegram.recordingMode ?? telegram.recording_mode) === "audio" ? "audio" : "voice",
    },
    qq: {
      enabled: !!qq.enabled,
      appId: str(qq.appId ?? qq.app_id),
      appSecret: str(qq.appSecret ?? qq.app_secret),
      groupIds: str(qq.groupIds ?? qq.group_ids),
      directIds: str(qq.directIds ?? qq.direct_ids),
    },
    weixin: {
      enabled: !!weixin.enabled,
      baseUrl: str(weixin.baseUrl ?? weixin.base_url) || "https://ilinkai.weixin.qq.com",
      allowedUserIds: joinList(weixin.allowedUserIds ?? weixin.allowed_user_ids),
      allowedGroupIds: joinList(weixin.allowedGroupIds ?? weixin.allowed_group_ids),
    },
    wecomBot: {
      enabled: !!wecomBot.enabled,
      botId: str(wecomBot.botId ?? wecomBot.bot_id),
      secret: str(wecomBot.secret),
      websocketUrl: str(wecomBot.websocketUrl ?? wecomBot.websocket_url) || "wss://openws.work.weixin.qq.com",
      allowedUserIds: joinList(wecomBot.allowedUserIds ?? wecomBot.allowed_user_ids),
      allowedGroupIds: joinList(wecomBot.allowedGroupIds ?? wecomBot.allowed_group_ids),
    },
    feishuBot: {
      enabled: !!feishuBot.enabled,
      appId: str(feishuBot.appId ?? feishuBot.app_id),
      appSecret: str(feishuBot.appSecret ?? feishuBot.app_secret),
      domain: str(feishuBot.domain) || "feishu",
      allowedUserIds: joinList(feishuBot.allowedUserIds ?? feishuBot.allowed_user_ids),
      allowedGroupIds: joinList(feishuBot.allowedGroupIds ?? feishuBot.allowed_group_ids),
    },
    webhook: {
      enabled: !!webhook.enabled,
      urls: strList(webhook.urls),
      secret: str(webhook.secret),
      timeoutMs: num(webhook.timeoutMs, 5000),
      retryMax: num(webhook.retryMax, 3),
      textTemplate:
        webhook.textTemplate === null || webhook.textTemplate === undefined
          ? "收到新短信\n设备  {{device_label}}\n号码  {{number}}\n时间  {{time}}\n内容  {{text}}"
          : String(webhook.textTemplate),
      headers: recordToHeaderRows(webhook.headers),
    },
    bark: {
      enabled: !!bark.enabled,
      urls: strList(bark.urls),
      group: str(bark.group) || "vofly",
      icon: str(bark.icon),
      level: str(bark.level) || "active",
    },
    email: {
      enabled: !!email.enabled,
      useSsl: !!email.useSsl,
      smtpHost: str(email.smtpHost),
      smtpPort: email.smtpPort === null || email.smtpPort === undefined ? "" : String(email.smtpPort),
      username: str(email.username),
      password: str(email.password),
      fromAddress: str(email.fromAddress),
      toAddresses: joinList(email.toAddresses),
    },
		pushplus: {
			enabled: !!pushplus.enabled,
			token: str(pushplus.token),
			topic: str(pushplus.topic),
			channel: str(pushplus.channel) || "wechat",
		},
		wecom: {
			enabled: !!wecom.enabled,
			urls: strList(wecom.urls),
			payloadTemplate: str(wecom.payloadTemplate ?? wecom.payload_template) || DEFAULT_WECOM_PAYLOAD_TEMPLATE,
		},
		lark: {
			enabled: !!lark.enabled,
			url: str(lark.url),
			signingEnabled: !!lark.signingEnabled,
			secret: lark.signingEnabled ? str(lark.secret) : "",
			payloadTemplate: str(lark.payloadTemplate ?? lark.payload_template) || DEFAULT_LARK_PAYLOAD_TEMPLATE,
		},
		meow: {
			enabled: !!meow.enabled,
			nickname: str(meow.nickname),
		},
	};
}

function splitList(value: string): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function buildWebhookPayload(form: WebhookForm, forTest = false) {
  const urls = Array.isArray(form.urls) ? form.urls : [];
  return {
    enabled: !!form.enabled,
    urls: forTest ? urls.map((url) => String(url || "").trim()).filter(Boolean) : urls,
    secret: form.secret || "",
    timeoutMs: Number(form.timeoutMs) || 5000,
    retryMax: Number(form.retryMax) || 3,
    textTemplate: String(form.textTemplate || ""),
    headers: headerRowsToRecord(form.headers),
  };
}

export function buildBarkPayload(form: BarkForm, forTest = false) {
  const urls = Array.isArray(form.urls) ? form.urls : [];
  return {
    enabled: !!form.enabled,
    urls: forTest ? urls.map((url) => String(url || "").trim()).filter(Boolean) : urls,
    group: String(form.group || "").trim(),
    icon: String(form.icon || "").trim(),
    level: String(form.level || "").trim(),
  };
}

export function buildEmailPayload(form: EmailForm, forTest = false) {
  return {
    enabled: !!form.enabled,
    useSsl: !!form.useSsl,
    smtpHost: forTest ? String(form.smtpHost || "").trim() : form.smtpHost || "",
    smtpPort: Number(form.smtpPort) || 0,
    username: forTest ? String(form.username || "").trim() : form.username || "",
    password: forTest ? String(form.password || "").trim() : form.password || "",
    fromAddress: forTest ? String(form.fromAddress || "").trim() : form.fromAddress || "",
    toAddresses: splitList(form.toAddresses),
  };
}

export function buildQQPayload(form: QQForm) {
  return {
    enabled: !!form.enabled,
    app_id: form.appId || "",
    app_secret: form.appSecret || "",
    group_ids: form.groupIds || "",
    direct_ids: form.directIds || "",
  };
}

export function buildWeixinPayload(form: WeixinForm) {
  return {
    enabled: !!form.enabled,
    base_url: form.baseUrl || "",
    allowed_user_ids: splitList(form.allowedUserIds),
    allowed_group_ids: splitList(form.allowedGroupIds),
  };
}

export function buildWeComBotPayload(form: WeComBotForm) {
  return {
    enabled: !!form.enabled,
    bot_id: form.botId || "",
    secret: form.secret || "",
    websocket_url: form.websocketUrl || "",
    allowed_user_ids: splitList(form.allowedUserIds),
    allowed_group_ids: splitList(form.allowedGroupIds),
  };
}

export function buildFeishuBotPayload(form: FeishuBotForm) {
  return {
    enabled: !!form.enabled,
    app_id: form.appId || "",
    app_secret: form.appSecret || "",
    domain: form.domain === "lark" ? "lark" : "feishu",
    allowed_user_ids: splitList(form.allowedUserIds),
    allowed_group_ids: splitList(form.allowedGroupIds),
  };
}

export function buildWecomPayload(form: WecomForm, forTest = false) {
	const urls = Array.isArray(form.urls) ? form.urls : [];
	return {
		enabled: !!form.enabled,
		urls: forTest ? urls.map((url) => String(url || "").trim()).filter(Boolean) : urls,
		payload_template: String(form.payloadTemplate || ""),
	};
}

export function buildLarkPayload(form: LarkForm, forTest = false) {
	const payload: {
		enabled: boolean;
		url?: string;
		signing_enabled: boolean;
		payload_template: string;
		secret?: string;
	} = {
		enabled: !!form.enabled,
		signing_enabled: !!form.signingEnabled,
		payload_template: String(form.payloadTemplate || ""),
	};
	const url = forTest ? String(form.url || "").trim() : String(form.url || "");
	if (url) payload.url = url;
	if (form.signingEnabled) payload.secret = String(form.secret || "");
	return payload;
}

export function buildMeoWPayload(form: MeoWForm, forTest = false) {
	return {
		enabled: !!form.enabled,
		nickname: forTest ? String(form.nickname || "").trim() : form.nickname || "",
	};
}

export function buildNotificationsPayload(forms: NotifyForms) {
  return {
    telegram: {
      enabled: !!forms.telegram.enabled,
      botToken: forms.telegram.botToken || "",
      // vofly 后端将 chat_id/admin_id 存为字符串（参考实现是数字）
      chatId: forms.telegram.chatId.trim(),
      adminId: forms.telegram.adminId.trim(),
      baseUrl: forms.telegram.baseUrl || "",
      proxy: forms.telegram.proxy || "",
      // api() 统一 snakeize 后即为后端校验的 recording_mode（voice|audio）
      recordingMode: forms.telegram.recordingMode === "audio" ? "audio" : "voice",
    },
    qq: buildQQPayload(forms.qq),
    weixin: buildWeixinPayload(forms.weixin),
    wecomBot: buildWeComBotPayload(forms.wecomBot),
    feishuBot: buildFeishuBotPayload(forms.feishuBot),
    email: buildEmailPayload(forms.email),
    pushplus: {
      enabled: !!forms.pushplus.enabled,
      token: forms.pushplus.token || "",
      topic: forms.pushplus.topic || "",
      channel: forms.pushplus.channel || "",
    },
    webhook: buildWebhookPayload(forms.webhook),
		bark: buildBarkPayload(forms.bark),
		wecom: buildWecomPayload(forms.wecom),
		lark: buildLarkPayload(forms.lark),
		meow: buildMeoWPayload(forms.meow),
	};
}
