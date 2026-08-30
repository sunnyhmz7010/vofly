export function phonePathForDevice(deviceId: string) {
  const clean = deviceId.trim();
  return clean ? `/phone?device=${encodeURIComponent(clean)}` : "/phone";
}

export function requestedPhoneDeviceId(search: string) {
  return new URLSearchParams(search).get("device")?.trim() || "";
}
