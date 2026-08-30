export function formatVersionLabel(version: string): string {
  const normalized = version.trim().replace(/^v+/i, "");
  return normalized ? `v${normalized}` : "vdev";
}
