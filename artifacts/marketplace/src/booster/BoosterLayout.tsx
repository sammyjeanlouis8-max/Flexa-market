import { Link, useLocation } from "wouter";
import {
  Home, PlusCircle, Zap, BarChart3, Users, HelpCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import "./booster.css";

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true, external: true },
  { href: "/booster/create", label: "Create Boost", icon: PlusCircle },
  { href: "/booster/campaigns", label: "My Boosts", icon: Zap },
  { href: "/booster/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/booster/audiences", label: "Saved Audiences", icon: Users },
  { href: "/support", label: "Help & Support", icon: HelpCircle, external: true },
] as const;

function isActive(path: string, href: string, exact?: boolean) {
  if (exact) return path === href;
  if (href === "/booster/create") {
    return path.startsWith("/booster/create")
      || path.startsWith("/booster/audience")
      || path.startsWith("/booster/budget")
      || path.startsWith("/booster/review");
  }
  return path === href || path.startsWith(href + "/");
}

export default function BoosterLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const [path] = useLocation();
  const { user } = useAuth();
  const initials = (user?.name || "FM")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bp-root" data-testid="booster-pro-root">
      <div className="bp-shell">
        <aside className="bp-sidebar" aria-label="Booster navigation">
          <div className="bp-brand">
            <div className="bp-brand-mark">F</div>
            <div className="bp-brand-text">
              <strong>Flexa Market</strong>
              <span>Booster Pro Max</span>
            </div>
          </div>

          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(path, item.href, "exact" in item ? item.exact : false);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`bp-nav-link${active ? " active" : ""}`}
                data-testid={`booster-nav-${item.href.replace(/\W+/g, "-")}`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}

          <div className="bp-sidebar-foot">
            <div className="bp-avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : initials}
            </div>
            <div className="bp-user-meta">
              <strong>{user?.name || "Advertiser"}</strong>
              <span>Business</span>
            </div>
          </div>
        </aside>

        <main className="bp-main">
          <nav className="bp-mobile-nav" aria-label="Booster sections">
            {NAV.filter((n) => !("external" in n && n.external && n.href === "/")).map((item) => {
              const active = isActive(path, item.href, "exact" in item ? item.exact : false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`bp-mobile-chip${active ? " active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <h1 className="bp-page-title">{title}</h1>
          {subtitle ? <p className="bp-page-sub">{subtitle}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
