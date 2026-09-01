import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BoardRegular,
  CallRegular,
  DocumentTextRegular,
  GlobeRegular,
  MailRegular,
  SendClockRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  RouterRegular,
  SettingsRegular,
  SignOutRegular,
  WindowConsoleRegular,
} from "@fluentui/react-icons";
import { useAuth } from "../../store/auth";
import { useI18n } from "../../lib/i18n";
import { confirmDialog } from "../ui/MessageBox";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { SwitchDark } from "../ui/SwitchDark";
import { Drawer } from "../ui/Drawer";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { cx } from "../../lib/utils";
import { BrandLogo } from "./BrandLogo";
import { VersionBadge } from "./VersionBadge";
import { listPlugins, type InstalledPlugin } from "../../extensions";

const NAV = [
  { to: "/", label: "仪表盘", icon: BoardRegular, end: true },
  { to: "/devices", label: "设备管理", icon: RouterRegular },
  { to: "/sms", label: "短信", icon: MailRegular },
  { to: "/phone", label: "通话", icon: CallRegular },
  { to: "/proxy", label: "代理管理", icon: GlobeRegular },
  { to: "/query-center", label: "查询中心", icon: WindowConsoleRegular },
  { to: "/automatic-tasks", label: "自动任务", icon: SendClockRegular },
  { to: "/logs", label: "实时日志", icon: DocumentTextRegular },
  { to: "/settings", label: "系统设置", icon: SettingsRegular },
];

export function AuthenticatedShell({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const { logout } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileOpen(false);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => listPlugins().then((items) => {
      if (active) setPlugins(items || []);
    }).catch(() => undefined);
    void load();
    window.addEventListener("vofly:plugins-changed", load);
    return () => { active = false; window.removeEventListener("vofly:plugins-changed", load); };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function onLogout() {
    const ok = await confirmDialog(t("确认退出登录？"), t("提示"), {
      confirmText: t("退出"),
      cancelText: t("取消"),
      type: "warning",
    });
    if (ok) {
      await logout();
      navigate("/login");
    }
  }

  function toggle() {
    if (isMobile) setMobileOpen(true);
    else setCollapsed((value) => !value);
  }

  function menuList(collapse: boolean) {
    const sidebarPlugins = plugins
      .filter((plugin) => plugin.enabled)
      .flatMap((plugin) => plugin.contributions
        .filter((contribution) => contribution.location === "sidebar")
        .map((contribution) => ({ plugin, contribution })));
    const navItems: Array<(typeof NAV)[number] | { to: string; label: string; icon: typeof GlobeRegular; pluginLabelZH?: string }> = [];
    for (const item of NAV) {
      navItems.push(item);
      if (item.to === "/proxy") {
        navItems.push({ to: "/export-proxy", label: "导出代理", icon: GlobeRegular });
      }
      const itemKey = item.to.replace(/^\//, "") || "dashboard";
      for (const extension of sidebarPlugins.filter((entry) => (entry.contribution.after || "sms") === itemKey)) {
        navItems.push({
          to: `/extensions/${encodeURIComponent(extension.plugin.id)}/${encodeURIComponent(extension.contribution.id)}`,
          label: extension.contribution.label,
          pluginLabelZH: extension.contribution.labelZh,
          icon: GlobeRegular,
        });
      }
    }
    return (
      <nav className={cx("sidebar-menu mt-2", collapse && "is-collapsed")} aria-label={t("主导航")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const label = "pluginLabelZH" in item && item.pluginLabelZH
            ? (lang === "zh" ? item.pluginLabelZH : item.label)
            : t(item.label);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : undefined}
              title={collapse ? label : undefined}
              className={({ isActive }) => cx("vofly-menu-item", isActive && "is-active")}
            >
              <span className="vofly-menu-icon">
                <Icon />
              </span>
              <span className="sidebar-menu-label">{label}</span>
            </NavLink>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex h-full">
      {!isMobile && (
        <aside
          className={cx(
            "ui-glass sidebar-shell relative h-full transition-[width] duration-200",
            collapsed ? "w-[52px]" : "w-[232px]",
          )}
        >
          <div className={cx("flex h-14 items-center px-4", collapsed && "justify-center px-0")}>
            <BrandLogo className="sidebar-brand-logo" />
            {!collapsed && (
              <div className="ml-3">
                <div className="sidebar-brand-title">vofly</div>
              </div>
            )}
          </div>
          {menuList(collapsed)}
        </aside>
      )}

      <Drawer open={isMobile && mobileOpen} onClose={() => setMobileOpen(false)} className="mobile-drawer">
        <div className="sidebar-shell relative h-full bg-white/95 backdrop-blur-md dark:bg-[#141418]/95">
          <div className="flex h-16 items-center px-4">
            <BrandLogo className="sidebar-brand-logo" />
            <div className="ml-3">
              <div className="sidebar-brand-title">vofly</div>
            </div>
          </div>
          {menuList(false)}
        </div>
      </Drawer>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="ui-glass sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-100 px-4 dark:border-white/5 sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? t("展开侧栏") : t("收起侧栏")}
              className="rounded-lg px-2 py-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
            >
              {!isMobile && !collapsed ? (
                <PanelLeftContractRegular className="h-5 w-5" />
              ) : (
                <PanelLeftExpandRegular className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <VersionBadge />
            <LanguageSwitch />
            <SwitchDark isDark={isDark} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onLogout}
              aria-label={t("退出登录")}
              title={t("退出登录")}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            >
              <SignOutRegular className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-gray-50/50 p-4 dark:bg-transparent sm:p-6">
          <div className="main-inner mx-auto w-full">
            <ErrorBoundary title={t("页面渲染失败")}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
