import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const LINKS = [
  { path: "", key: "centerOverview", fallback: "Overview" },
  { path: "/services", key: "centerServices", fallback: "Services" },
  { path: "/staff", key: "centerStaff", fallback: "Staff" },
  { path: "/calendar", key: "centerCalendar", fallback: "Calendar" },
  { path: "/portfolio", key: "centerPortfolio", fallback: "Portfolio" },
  { path: "/revenue", key: "centerRevenue", fallback: "Revenue" },
  { path: "/reviews", key: "centerReviews", fallback: "Reviews" },
  { path: "/settings", key: "centerSettings", fallback: "Settings" },
] as const;

export function CenterNav({ businessId }: { businessId: number }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const base = `/beauty/center/${businessId}`;

  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto pb-1" aria-label="Beauty Center">
      {LINKS.map((link) => {
        const href = `${base}${link.path}`;
        const active =
          link.path === ""
            ? location === base || location === `${base}/`
            : location.startsWith(href);
        return (
          <Link
            key={link.path}
            href={href}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
              active
                ? "bg-[hsl(350,45%,38%)] text-white"
                : "border border-[hsl(350,20%,88%)] bg-white text-[hsl(350,20%,30%)]",
            )}
          >
            {t(`beauty.${link.key}`, { defaultValue: link.fallback })}
          </Link>
        );
      })}
    </nav>
  );
}

export function useCenterBusinessId(paramId?: string): number | null {
  const n = Number(paramId);
  return Number.isFinite(n) ? n : null;
}
