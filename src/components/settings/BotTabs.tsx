import { useI18n } from "../../lib/i18n";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useNotificationQR } from "../../lib/notificationOnboarding";
import { ChannelHeader, Field, PasswordInput } from "./controls";
import { NotificationQrConnect } from "./NotificationQrConnect";
import type { PushplusForm, QQForm, TelegramForm, WeComBotForm, WeixinForm } from "./model";

interface ChannelProps<T> {
  value: T;
  onChange: (patch: Partial<T>) => void;
}

interface InteractiveChannelProps<T> extends ChannelProps<T> {
  onApplied?: () => Promise<void> | void;
}

export function TelegramTab({ value, onChange }: ChannelProps<TelegramForm>) {
  const { t } = useI18n();
  const off = !value.enabled;
  return (
    <div className="pt-2">
      <ChannelHeader title={t("启用 Telegram 机器人")} enabled={value.enabled} onToggle={(enabled) => onChange({ enabled })} />
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
          {t("启用后会推送新短信，并允许指定管理员通过 Bot 查看状态、切卡、管理 WiFi Calling、发送短信和限时拨号。拨号只执行呼叫并自动挂断，不处理音频。")}
        </div>
        <Field label="Bot Token">
          <Input value={value.botToken} onChange={(e) => onChange({ botToken: e.target.value })} disabled={off} placeholder="xxxx:yyyy" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Chat ID" hint={t("接收短信通知和命令回复的私聊或群组 ID。群组 ID 可以是负数。")}>
            <Input value={value.chatId} onChange={(e) => onChange({ chatId: e.target.value })} disabled={off} type="number" inputMode="numeric" placeholder={t("例如 123456")} />
          </Field>
          <Field label="Admin ID" hint={t("只有该 Telegram 用户可以执行控制命令；留空时仅推送通知，不接受命令。")}>
            <Input value={value.adminId} onChange={(e) => onChange({ adminId: e.target.value })} disabled={off} type="number" inputMode="numeric" placeholder={t("例如 123456")} />
          </Field>
        </div>
        <Field label={t("录音展示模式")} hint={t("控制通话录音在 Telegram 中以语音气泡还是音频卡片发送。")}>
          <Select
            value={value.recordingMode}
            onChange={(recordingMode) => onChange({ recordingMode })}
            options={[
              { value: "voice", label: t("语音气泡 (voice)") },
              { value: "audio", label: t("音频卡片 (audio)") },
            ]}
            disabled={off}
            placeholder={t("选择录音展示模式")}
            className="w-full"
          />
        </Field>
        <Field label={t("TG API 反代（可选）")} hint={t("反向代理地址 (例如 https://api.telegram.org/bot%s/%s)")}>
          <Input value={value.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} disabled={off} placeholder={t("留空直连 api.telegram.org；需要反代时填写")} />
        </Field>
        <Field label={t("HTTP 代理（可选）")} hint={t("用于连接 API 服务器的 HTTP 代理")}>
          <Input value={value.proxy} onChange={(e) => onChange({ proxy: e.target.value })} disabled={off} placeholder={t("例如 http://127.0.0.1:7890")} />
        </Field>
      </div>
    </div>
  );
}

export function QQTab({ value, onChange, onApplied }: InteractiveChannelProps<QQForm>) {
  const { t } = useI18n();
  const qr = useNotificationQR("qq", {
    onApplied: async () => {
      await onApplied?.();
    },
  });
  const off = !value.enabled;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 pt-2 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <NotificationQrConnect
        title={t("QQ 扫码注册")}
        connected={value.enabled}
        session={qr.session}
        busy={qr.loading}
        polling={qr.polling}
        error={qr.error}
        onStart={() => void qr.start()}
        onCancel={() => void qr.cancel()}
      />

      <section className="min-w-0" aria-labelledby="qq-manual-title">
        <ChannelHeader title={t("QQ Bot 配置")} enabled={value.enabled} onToggle={(enabled) => onChange({ enabled })} />
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            {t("扫码会自动写入 Bot 凭证与首个私聊用户，手动字段用于白名单、默认目标和长期运行配置。")}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="App ID">
              <Input value={value.appId} onChange={(e) => onChange({ appId: e.target.value })} disabled={off} placeholder="QQ Bot App ID" />
            </Field>
            <Field label={t("App Secret")}>
              <PasswordInput value={value.appSecret} onChange={(appSecret) => onChange({ appSecret })} disabled={off} placeholder="********" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("群 OpenID")} hint={t("多个使用英文逗号分隔")}>
              <Input value={value.groupIds} onChange={(e) => onChange({ groupIds: e.target.value })} disabled={off} placeholder={t("多个使用英文逗号分隔")} />
            </Field>
            <Field label={t("私聊 OpenID")} hint={t("首个私聊用户会自动绑定")}>
              <Input value={value.directIds} onChange={(e) => onChange({ directIds: e.target.value })} disabled={off} placeholder={t("首个私聊用户会自动绑定")} />
            </Field>
          </div>
        </div>
      </section>
    </div>
  );
}

export function WeixinTab({ value, onChange, onApplied }: InteractiveChannelProps<WeixinForm>) {
  const { t } = useI18n();
  const qr = useNotificationQR("weixin", {
    onApplied: async () => {
      await onApplied?.();
    },
  });
  const off = !value.enabled;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 pt-2 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <NotificationQrConnect
        title={t("个人微信扫码")}
        connected={value.enabled}
        session={qr.session}
        busy={qr.loading}
        polling={qr.polling}
        error={qr.error}
        onStart={() => void qr.start({ baseUrl: value.baseUrl })}
        onCancel={() => void qr.cancel()}
      />

      <section className="min-w-0" aria-labelledby="weixin-manual-title">
        <ChannelHeader title={t("个人微信 iLink")} enabled={value.enabled} onToggle={(enabled) => onChange({ enabled })} />
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            {t("个人微信长连接用于接收通知、执行 slash 命令，并支持 /y /n 确认交互。")}
          </div>
          <Field label={t("iLink 服务地址")}>
            <Input value={value.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} disabled={off} placeholder="https://ilinkai.weixin.qq.com" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("允许私聊用户 ID")} hint={t("多个使用英文逗号分隔")}>
              <Input value={value.allowedUserIds} onChange={(e) => onChange({ allowedUserIds: e.target.value })} disabled={off} placeholder={t("多个使用英文逗号分隔")} />
            </Field>
            <Field label={t("允许群聊 ID")} hint={t("多个使用英文逗号分隔")}>
              <Input value={value.allowedGroupIds} onChange={(e) => onChange({ allowedGroupIds: e.target.value })} disabled={off} placeholder={t("多个使用英文逗号分隔")} />
            </Field>
          </div>
        </div>
      </section>
    </div>
  );
}

export function WeComBotTab({ value, onChange, onApplied }: InteractiveChannelProps<WeComBotForm>) {
  const { t } = useI18n();
  const qr = useNotificationQR("wecom-bot", {
    onApplied: async () => {
      await onApplied?.();
    },
  });
  const off = !value.enabled;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 pt-2 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <NotificationQrConnect
        title={t("企微机器人扫码")}
        connected={value.enabled}
        session={qr.session}
        busy={qr.loading}
        polling={qr.polling}
        error={qr.error}
        onStart={() => void qr.start()}
        onCancel={() => void qr.cancel()}
      />

      <section className="min-w-0" aria-labelledby="wecom-bot-manual-title">
        <ChannelHeader title={t("企微长连接机器人")} enabled={value.enabled} onToggle={(enabled) => onChange({ enabled })} />
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            {t("企业微信长连接 Bot 支持通知、命令执行、确认交互和媒体附件回传。")}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bot ID">
              <Input value={value.botId} onChange={(e) => onChange({ botId: e.target.value })} disabled={off} placeholder={t("企业微信 Bot ID")} />
            </Field>
            <Field label="Secret">
              <PasswordInput value={value.secret} onChange={(secret) => onChange({ secret })} disabled={off} placeholder="********" />
            </Field>
          </div>
          <Field label={t("WebSocket 地址")}>
            <Input value={value.websocketUrl} onChange={(e) => onChange({ websocketUrl: e.target.value })} disabled={off} placeholder="wss://openws.work.weixin.qq.com" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("允许私聊用户 ID")} hint={t("首个私聊用户会自动绑定")}>
              <Input value={value.allowedUserIds} onChange={(e) => onChange({ allowedUserIds: e.target.value })} disabled={off} placeholder={t("首个私聊用户会自动绑定")} />
            </Field>
            <Field label={t("允许群聊 ID")} hint={t("多个使用英文逗号分隔")}>
              <Input value={value.allowedGroupIds} onChange={(e) => onChange({ allowedGroupIds: e.target.value })} disabled={off} placeholder={t("多个使用英文逗号分隔")} />
            </Field>
          </div>
        </div>
      </section>
    </div>
  );
}

const PUSHPLUS_CHANNEL_OPTIONS = [
  { value: "wechat", label: "WeChat (wechat)" },
  { value: "webhook", label: "Webhook (webhook)" },
  { value: "cp", label: "WeCom (cp)" },
  { value: "mail", label: "Email (mail)" },
];

export function PushplusTab({ value, onChange }: ChannelProps<PushplusForm>) {
  const { t } = useI18n();
  const off = !value.enabled;
  return (
    <div className="pt-2">
      <ChannelHeader title={t("启用 Pushplus 推送")} enabled={value.enabled} onToggle={(enabled) => onChange({ enabled })} />
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
          {t("该渠道仅用于单向通知，不提供设备控制功能。新短信会逐条推送；启用通知的自动任务也会推送执行结果。")}
        </div>
        <Field label="Token">
          <Input value={value.token} onChange={(e) => onChange({ token: e.target.value })} disabled={off} placeholder={t("Pushplus 用户的 Token")} />
        </Field>
        <Field label={t("群组编码 (Topic)")}>
          <Input value={value.topic} onChange={(e) => onChange({ topic: e.target.value })} disabled={off} placeholder={t("群组编码，不填则发给个人")} />
        </Field>
        <Field label={t("渠道 (Channel)")}>
          <Select
            value={value.channel}
            onChange={(channel) => onChange({ channel })}
            options={PUSHPLUS_CHANNEL_OPTIONS}
            disabled={off}
            placeholder={t("选择渠道")}
            className="w-full"
          />
        </Field>
      </div>
    </div>
  );
}
