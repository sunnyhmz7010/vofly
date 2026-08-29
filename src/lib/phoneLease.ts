import { useCallback, useEffect, useState } from "react";

// 通话控制租约：同一活动通话只允许一个浏览器标签页控制，其余标签页只读观察。
// 对齐 hideck 的单标签页控制语义（hideck_phone_control 存 sessionStorage 保存本标签页
// 的控制声明，租约裁决由服务端完成）；vofly 没有服务端租约，裁决移到浏览器侧：
// - sessionStorage（vofly.phone.control）保存本标签页的声明 {tabId, acquiredAt, heartbeatAt}，
//   随标签页生命周期存续，刷新后不丢（对齐 hideck_phone_control 的定位）；
// - localStorage（vofly.phone.control.holder）镜像当前持有者与心跳，配合 storage 事件
//   让其他标签页感知控制权归属（sessionStorage 天然按标签页隔离，跨页不可见）；
// - 持有者每 PHONE_LEASE_HEARTBEAT_MS 刷新一次心跳，超过 PHONE_LEASE_STALE_MS 未刷新
//   即视为陈旧（标签页崩溃/被强杀时不会触发 beforeunload），其余标签页可重新声明。

export const PHONE_CONTROL_LEASE_KEY = "vofly.phone.control";
export const PHONE_CONTROL_HOLDER_KEY = "vofly.phone.control.holder";
export const PHONE_LEASE_HEARTBEAT_MS = 2000;
export const PHONE_LEASE_STALE_MS = 6000;

export interface PhoneControlLease {
  tabId: string;
  acquiredAt: number;
  heartbeatAt: number;
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function randomTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 非 secure context 回退：拼出 UUID 形态的随机串即可，仅用于标签页自识别。
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.trunc(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function parseLease(raw: string | null): PhoneControlLease | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PhoneControlLease> | null;
    if (!parsed || typeof parsed.tabId !== "string" || !parsed.tabId) return null;
    const acquiredAt = typeof parsed.acquiredAt === "number" ? parsed.acquiredAt : 0;
    const heartbeatAt = typeof parsed.heartbeatAt === "number" ? parsed.heartbeatAt : acquiredAt;
    return { tabId: parsed.tabId, acquiredAt, heartbeatAt };
  } catch {
    return null;
  }
}

// 本标签页的控制声明；损坏即清除（对齐 hideck readPhoneControl 的容错）。
export function readLocalLease(): PhoneControlLease | null {
  const session = safeSessionStorage();
  if (!session) return null;
  const lease = parseLease(session.getItem(PHONE_CONTROL_LEASE_KEY));
  if (!lease) session.removeItem(PHONE_CONTROL_LEASE_KEY);
  return lease;
}

function writeLocalLease(lease: PhoneControlLease) {
  safeSessionStorage()?.setItem(PHONE_CONTROL_LEASE_KEY, JSON.stringify(lease));
}

function clearLocalLease() {
  safeSessionStorage()?.removeItem(PHONE_CONTROL_LEASE_KEY);
}

// 共享持有者记录：跨标签页广播“控制权在谁手里、心跳是否新鲜”。
export function readHolderLease(): PhoneControlLease | null {
  const local = safeLocalStorage();
  if (!local) return null;
  const lease = parseLease(local.getItem(PHONE_CONTROL_HOLDER_KEY));
  if (!lease) local.removeItem(PHONE_CONTROL_HOLDER_KEY);
  return lease;
}

function writeHolderLease(lease: PhoneControlLease) {
  safeLocalStorage()?.setItem(PHONE_CONTROL_HOLDER_KEY, JSON.stringify(lease));
}

function clearHolderLease() {
  safeLocalStorage()?.removeItem(PHONE_CONTROL_HOLDER_KEY);
}

// 超过 PHONE_LEASE_STALE_MS 未刷新心跳的租约视为陈旧，可被其他标签页声明。
export function isLeaseStale(lease: PhoneControlLease, now = Date.now()): boolean {
  return now - (lease.heartbeatAt || lease.acquiredAt) > PHONE_LEASE_STALE_MS;
}

// 标签页身份：页面加载时生成随机 UUID；从本页刷新（sessionStorage 仍在）时沿用原身份。
let cachedTabId = "";

export function ensureTabId(): string {
  if (cachedTabId) return cachedTabId;
  cachedTabId = readLocalLease()?.tabId || randomTabId();
  return cachedTabId;
}

// 声明/接管控制权。对齐 hideck 的 takeover 语义：最新声明胜出（newest claim wins）——
// 不做任何存活检查，无条件覆盖本地声明与共享持有者记录（等价 hideck takeover=true 的
// 租约转移）；被顶掉的原持有标签页下次对账时发现新鲜的外来租约，自动降级为只读观察。
export function claimPhoneControl(now = Date.now()): PhoneControlLease {
  const lease: PhoneControlLease = { tabId: ensureTabId(), acquiredAt: now, heartbeatAt: now };
  writeLocalLease(lease);
  writeHolderLease(lease);
  return lease;
}

// 主动释放：清掉本页声明；共享持有者仍属于本页时一并移除（其他标签页的 storage
// 事件会立即看到“无主”，无需等 6s 陈旧判定）。
export function releasePhoneControl(): void {
  const mine = readLocalLease();
  clearLocalLease();
  if (!mine) return;
  const holder = readHolderLease();
  if (!holder || holder.tabId === mine.tabId) clearHolderLease();
}

// 对账：返回本页当前是否被锁（存在属于其他存活标签页的新鲜租约）。
// 本页仍持有时顺带刷新心跳并（重）发布共享记录；发现被其他存活标签页接管
// 则丢弃本地声明，进入只读观察。挂载时、每 2s、storage 事件与重新可见时调用。
export function syncPhoneLease(now = Date.now()): boolean {
  const tabId = ensureTabId();
  const holder = readHolderLease();
  if (holder && !isLeaseStale(holder, now) && holder.tabId !== tabId) {
    clearLocalLease();
    return true;
  }
  const mine = readLocalLease();
  if (mine) {
    const refreshed: PhoneControlLease = { ...mine, heartbeatAt: now };
    writeLocalLease(refreshed);
    writeHolderLease(refreshed);
  }
  return false;
}

export interface PhoneControlLeaseHandle {
  /** true 表示控制权在其他存活标签页：本页只读观察，通话控件应禁用并展示接管横幅。 */
  controlsLocked: boolean;
  /** 拨号/接听/挂断/DTMF 前声明控制权（最新声明胜出）。 */
  claim: () => void;
  /** 主动释放（挂断成功、通话结束后调用）。 */
  release: () => void;
}

export function usePhoneControlLease(): PhoneControlLeaseHandle {
  const [controlsLocked, setControlsLocked] = useState(false);

  useEffect(() => {
    ensureTabId();
    setControlsLocked(syncPhoneLease());

    const tick = () => setControlsLocked(syncPhoneLease());
    const timer = window.setInterval(tick, PHONE_LEASE_HEARTBEAT_MS);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PHONE_CONTROL_HOLDER_KEY) tick();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onBeforeUnload = () => releasePhoneControl();

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releasePhoneControl();
    };
  }, []);

  const claim = useCallback(() => {
    claimPhoneControl();
    setControlsLocked(false);
  }, []);

  const release = useCallback(() => {
    releasePhoneControl();
    setControlsLocked(false);
  }, []);

  return { controlsLocked, claim, release };
}
