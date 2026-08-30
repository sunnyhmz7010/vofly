export interface EsimConfigurationSnapshot {
  chipInfo?: unknown;
  profiles?: unknown;
}

export function hasEsimConfiguration(snapshot: EsimConfigurationSnapshot | null | undefined): boolean {
  if (snapshot?.chipInfo != null) return true;
  if (!Array.isArray(snapshot?.profiles)) return false;
  return snapshot.profiles.some((group) => {
    if (!group || typeof group !== "object") return false;
    const profiles = (group as { profiles?: unknown }).profiles;
    return Array.isArray(profiles) && profiles.length > 0;
  });
}
