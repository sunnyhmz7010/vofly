import { WeatherMoonRegular, WeatherSunnyRegular } from "@fluentui/react-icons";
import { useI18n } from "../../lib/i18n";

// SwitchDark: circular theme toggle button (moon in light, sun in dark).
export function SwitchDark({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? t("切换浅色模式") : t("切换深色模式")}
      className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-gray-100/70 text-gray-600 transition-colors hover:bg-gray-200/70 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
    >
      {isDark ? <WeatherSunnyRegular className="h-[18px] w-[18px]" /> : <WeatherMoonRegular className="h-[18px] w-[18px]" />}
    </button>
  );
}
