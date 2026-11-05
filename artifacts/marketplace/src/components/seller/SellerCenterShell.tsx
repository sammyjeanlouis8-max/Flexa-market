import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, PlusCircle, Package, ShoppingBag, MessageCircle,
  Wallet, Settings, HelpCircle, Menu, Bell, Store, X, BarChart3,
  Boxes,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import NotificationsDropdown from "@/components/NotificationsDropdown";

const GREEN = "hsl(152,65%,18%)";
const GREEN_DARK = "hsl(152,65%,14%)";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (loc: string) => boolean;
};

export default function SellerCenterShell({
  children,
  searchPlaceholder,
}: {
  children: ReactNode;
  searchPlaceholder?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [q, setQ] = useState("");

  const nav: NavItem[] = [
    { href: "/sales", label: t("nav.dashboard", { defaultValue: "Dashboard" }), icon: LayoutDashboard },
    {
      href: "/sell",
      label: t("sell.addProduct", { defaultValue: "Add Product" }),
      icon: PlusCircle,
      match: (loc) => loc.startsWith("/sell"),
    },
    { href: "/sales", label: t("nav.myProducts", { defaultValue: "My Products" }), icon: Package },
    { href: "/sales", label: t("nav.inventory", { defaultValue: "Inventory" }), icon: Boxes },
    { href: "/orders", label: t("nav.orders", { defaultValue: "Orders" }), icon: ShoppingBag },
    { href: "/messages", label: t("nav.messages", { defaultValue: "Messages" }), icon: MessageCircle },
    { href: "/wallet", label: t("nav.earnings", { defaultValue: "Earnings" }), icon: Wallet },
    { href: "/settings", label: t("nav.storeSettings", { defaultValue: "Store Settings" }), icon: Settings },
    { href: "/sales", label: t("nav.reports", { defaultValue: "Reports" }), icon: BarChart3 },
    { href: "/support", label: t("nav.helpSupport", { defaultValue: "Help & Support" }), icon: HelpCircle },
  ];

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5 px-2 py-3">
      {nav.map((item, idx) => {
        const highlighted = item.match
          ? item.match(location)
          : item.href === "/sell"
            ? false
            : idx === 0
              ? location.startsWith("/sales") && !location.startsWith("/sell")
              : location.startsWith(item.href) && item.href !== "/sales";

        return (
          <Link
            key={`${item.href}-${item.label}-${idx}`}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
              highlighted
                ? "bg-[#F97316] text-white shadow-sm"
                : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
            data-testid={`seller-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh flex flex-col bg-[#F3F4F6]" data-testid="seller-center-shell">
      {/* Top header */}
      <header
        className="sticky top-0 z-50 text-white shadow-sm"
        style={{ background: GREEN }}
      >
        <div className="h-14 md:h-16 px-3 md:px-4 flex items-center gap-2 md:gap-4 max-w-[1600px] mx-auto w-full">
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg hover:bg-white/10"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t("nav.menu")}
            data-testid="seller-hamburger"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/sell" className="flex items-center gap-2 shrink-0 min-w-0">
            <img src="/flexa-logo-v2.png" alt="" className="h-8 w-auto md:h-9" width="36" height="36" />
            <div className="min-w-0 leading-tight">
              <p className="font-bold text-[13px] md:text-[15px] truncate">Flexa Market</p>
              <p className="text-[10px] md:text-[11px] text-white/80 truncate">
                {t("sell.sellerCenter", { defaultValue: "Seller Center" })}
              </p>
            </div>
          </Link>

          <form
            className="hidden md:flex flex-1 max-w-xl mx-4"
            onSubmit={(e) => {
              e.preventDefault();
              const query = q.trim();
              setLocation(query ? `/search?q=${encodeURIComponent(query)}` : "/sales");
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder || t("sell.sellerSearch", { defaultValue: "Search products, orders, and more..." })}
              className="w-full h-10 rounded-lg bg-white text-foreground px-3 text-sm outline-none focus:ring-2 focus:ring-[#F97316]/50"
              data-testid="seller-search"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            {user && <NotificationsDropdown light />}
            {!user && (
              <button type="button" className="p-2 rounded-lg hover:bg-white/10" aria-label="Notifications">
                <Bell className="h-5 w-5" />
              </button>
            )}
            <Link
              href="/settings"
              className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-white/10"
              data-testid="seller-my-store"
            >
              <Store className="h-5 w-5" />
              <span className="hidden sm:inline text-[12px] font-semibold">
                {t("sell.myStore", { defaultValue: "My Store" })}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 max-w-[1600px] mx-auto w-full">
        {/* Desktop sidebar */}
        <aside
          className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col sticky top-16 self-start h-[calc(100dvh-4rem)] overflow-y-auto"
          style={{ background: GREEN_DARK }}
          data-testid="seller-sidebar"
        >
          <NavLinks />
          <div className="mt-auto px-4 py-4 border-t border-white/10">
            <Link href="/" className="text-[12px] text-white/70 hover:text-white">
              ← {t("nav.backToMarketplace", { defaultValue: "Back to marketplace" })}
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-[80]" data-testid="seller-mobile-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-[78%] max-w-xs flex flex-col shadow-xl"
            style={{ background: GREEN_DARK }}
          >
            <div className="flex items-center justify-between px-3 h-14 border-b border-white/10 text-white">
              <span className="font-bold text-sm">{t("sell.sellerCenter", { defaultValue: "Seller Center" })}</span>
              <button type="button" className="p-2 rounded-lg hover:bg-white/10" onClick={() => setMobileNavOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
            <Link
              href="/"
              onClick={() => setMobileNavOpen(false)}
              className="mt-auto mx-4 mb-6 text-[12px] text-white/70"
            >
              ← {t("nav.backToMarketplace", { defaultValue: "Back to marketplace" })}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function SellAccordionSection({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
  complete,
  errorCount = 0,
  missingLabel,
  completedLabel = "Completed",
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** True only when all required fields in this section are valid. */
  complete?: boolean;
  /** Number of invalid required fields after a publish attempt. */
  errorCount?: number;
  /** e.g. "2 fields missing" — shown when errorCount > 0 */
  missingLabel?: string;
  completedLabel?: string;
}) {
  const hasErrors = errorCount > 0;
  const status = hasErrors ? "error" : complete ? "complete" : "neutral";

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden shadow-sm transition-colors",
        hasErrors
          ? "border-red-400 bg-red-50/70"
          : complete
            ? "border-border bg-white"
            : "border-border bg-white",
      )}
      data-testid={`sell-section-${id}`}
      data-section-status={status}
      data-error-count={errorCount}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
          hasErrors
            ? "bg-red-50/80"
            : open
              ? "bg-[hsl(152,40%,94%)]"
              : "bg-white hover:bg-muted/30",
        )}
        aria-expanded={open}
      >
        <span
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            hasErrors
              ? "bg-red-100 text-red-600"
              : complete
                ? "bg-emerald-100 text-emerald-700"
                : open
                  ? "bg-[hsl(152,65%,22%)] text-white"
                  : "bg-[hsl(152,40%,92%)] text-[hsl(152,65%,22%)]",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 font-bold text-[14px] text-foreground min-w-0 truncate">{title}</span>
        {hasErrors && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full shrink-0"
            data-testid={`sell-section-${id}-errors`}
          >
            <span aria-hidden>!</span>
            {missingLabel || `${errorCount} fields missing`}
          </span>
        )}
        {!hasErrors && complete && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0"
            data-testid={`sell-section-${id}-complete`}
          >
            <span aria-hidden>✓</span>
            {completedLabel}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div
          className={cn(
            "px-4 pb-4 pt-1 space-y-4 border-t",
            hasErrors ? "border-red-200/80 bg-red-50/40" : "border-border/50 bg-white",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export const SELL_STEPS = [
  { id: "info", labelKey: "sell.stepInfo", defaultLabel: "Product Info" },
  { id: "media", labelKey: "sell.stepMedia", defaultLabel: "Photos & Videos" },
  { id: "pricing", labelKey: "sell.stepPricing", defaultLabel: "Pricing & Inventory" },
  { id: "delivery", labelKey: "sell.stepDelivery", defaultLabel: "Delivery & Location" },
  { id: "review", labelKey: "sell.stepReview", defaultLabel: "Review & Publish" },
] as const;
