import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Home, PlusCircle, Zap, BarChart3, Users, HelpCircle, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import "./booster.css";

const NAV = [
  { href: "/", labelKey: "booster.nav.home", icon: Home, exact: true, external: true },
  { href: "/booster/create", labelKey: "booster.nav.create", icon: PlusCircle },
  { href: "/booster", labelKey: "booster.nav.myBoosts", icon: Zap, exact: true },
  { href: "/boost-analytics", labelKey: "booster.nav.analytics", icon: BarChart3 },
  { href: "/booster/audiences", labelKey: "booster.nav.audiences", icon: Users },
  { href: "/booster/help", labelKey: "booster.nav.help", icon: HelpCircle },
] as const;

export default function BoosterLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = (user?.name || "FM").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location === href || (href === "/booster" && location === "/booster/");
    return location === href || location.startsWith(href + "/");
  };

  const Nav = (
    <>
      <Link href="/" className="bp-brand" onClick={() => setOpen(false)}>
        <span className="bp-brand-mark">FM</span>
        Flexa Market
      </Link>
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = !("external" in item && item.external) && isActive(item.href, "exact" in item ? item.exact : false);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bp-nav-btn${active ? " active" : ""}`}
            onClick={() => setOpen(false)}
            data-testid={`booster-nav-${item.href.replace(/\//g, "-") || "home"}`}
          >
            <Icon className="h-4 w-4" />
            {t(item.labelKey)}
          </Link>
        );
      })}
      <div className="bp-sidebar-foot">
        <div className="bp-avatar">{initials}</div>
        <div>
          <div className="text-sm font-bold leading-tight">{user?.name || t("booster.guest")}</div>
          <div className="text-xs text-slate-500">{t("booster.business")}</div>
        </div>
      </div>
    </>
  );

  return (
    <div className="booster-pro" data-testid="booster-pro-shell">
      <div className="bp-shell">
        <aside className={`bp-sidebar${open ? " open" : ""}`}>
          {open && (
            <button type="button" className="bp-nav-btn" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" /> {t("common.close", { defaultValue: "Close" })}
            </button>
          )}
          {Nav}
        </aside>
        <main className="bp-main">
          <div className="bp-mobile-bar">
            <button type="button" className="bp-btn bp-btn-ghost" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-bold text-sm">Booster Pro</span>
            <Link href="/booster/create" className="bp-btn bp-btn-primary" style={{ padding: "0.45rem 0.75rem" }}>
              +
            </Link>
          </div>
          <h1 className="bp-h1">{title}</h1>
          {subtitle ? <p className="bp-sub">{subtitle}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
