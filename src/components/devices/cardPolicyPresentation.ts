export interface EsimConfigurationSnapshot {
  chipInfo?: unknown;
  profiles?: unknown;
}

export type CardPolicyMode = "network" | "vowifi" | "airplane";

export interface CardPolicyModeFlags {
  networkEnabled: boolean;
  vowifiEnabled: boolean;
  airplaneEnabled: boolean;
}

// Only block enabling a conflicting mode. Disabling an active mode remains
// available so a legacy inconsistent policy can be repaired.
export function isCardPolicyModeDisabled(mode: CardPolicyMode, flags: CardPolicyModeFlags): boolean {
  if (mode === "network") return !flags.networkEnabled && (flags.vowifiEnabled || flags.airplaneEnabled);
  if (mode === "vowifi") return !flags.vowifiEnabled && flags.networkEnabled;
  return !flags.airplaneEnabled && flags.networkEnabled;
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
