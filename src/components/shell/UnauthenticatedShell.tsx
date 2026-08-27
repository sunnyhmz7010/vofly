import { Outlet } from "react-router-dom";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { SwitchDark } from "../ui/SwitchDark";

// UnauthenticatedShell: centers the login card, theme toggle pinned top-right.
export function UnauthenticatedShell({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 transition-colors duration-300 dark:bg-gray-950">
      <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
        <LanguageSwitch />
        <SwitchDark isDark={isDark} onToggle={onToggleTheme} />
      </div>
      <Outlet />
    </div>
  );
}
