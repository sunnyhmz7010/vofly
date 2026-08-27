import { BrandLogo } from "../shell/BrandLogo";

export function LoadingScreen() {
  return (
    <div className="vofly-boot-loader" role="status" aria-live="polite" aria-label="Loading VoFly">
      <BrandLogo className="vofly-boot-logo" />
      <span className="sr-only">Loading VoFly</span>
    </div>
  );
}
