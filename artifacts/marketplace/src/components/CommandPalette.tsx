import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useLocation } from "wouter";
import {
  Home,
  Search,
  Plus,
  MessageCircle,
  Wallet,
  ShoppingBag,
  ShoppingCart,
  Settings,
  Film,
  Music2,
  Tv,
  Heart,
  Tag,
  Crown,
  HelpCircle,
  Sparkles,
  Calculator,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/auth";
import { prefetchRoute } from "@/lib/prefetchRoutes";

type CommandEntry = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  keywords?: string;
  auth?: boolean;
};

/**
 * Desktop ⌘K / Ctrl+K command palette — native-app style quick navigation.
 * English-first labels with i18n where keys already exist.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const entries = useMemo(() => {
    const base: CommandEntry[] = [
      { href: "/", label: t("nav.home", { defaultValue: "Home" }), icon: Home, keywords: "home feed" },
      { href: "/search", label: t("nav.search", { defaultValue: "Search" }), icon: Search, keywords: "find listings" },
      { href: "/sell", label: t("nav.sell", { defaultValue: "Sell" }), icon: Plus, keywords: "create listing", auth: true },
      { href: "/messages", label: t("nav.messages", { defaultValue: "Messages" }), icon: MessageCircle, auth: true },
      { href: "/cart", label: t("nav.cart", { defaultValue: "Cart" }), icon: ShoppingCart },
      { href: "/orders", label: t("nav.orders", { defaultValue: "Orders" }), icon: ShoppingBag, auth: true },
      { href: "/wallet", label: t("nav.wallet", { defaultValue: "Wallet" }), icon: Wallet, auth: true },
      { href: "/saved", label: t("nav.saved", { defaultValue: "Saved" }), icon: Heart, auth: true },
      { href: "/offers", label: t("nav.offers", { defaultValue: "Offers" }), icon: Tag, auth: true },
      { href: "/subscription", label: t("nav.subscription", { defaultValue: "Subscription" }), icon: Crown, auth: true },
      { href: "/videos", label: t("nav.videos", { defaultValue: "Videos" }), icon: Film },
      { href: "/tv", label: "Flexa TV", icon: Tv },
      { href: "/music", label: "Flexa Music", icon: Music2 },
      { href: "/chatbot", label: "FlexaBot AI", icon: Sparkles },
      { href: "/calculator", label: "CalcAI", icon: Calculator, auth: true },
      { href: "/support", label: t("nav.support", { defaultValue: "Support" }), icon: HelpCircle },
      { href: "/settings", label: t("nav.settings", { defaultValue: "Settings" }), icon: Settings, auth: true },
    ];
    return base.filter((e) => !e.auth || !!user);
  }, [t, user]);

  const go = (href: string) => {
    prefetchRoute(href);
    setOpen(false);
    setLocation(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Open command palette"
        data-testid="command-palette-trigger"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Quick jump</span>
        <kbd className="pointer-events-none ml-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <CommandItem
                  key={entry.href}
                  value={`${entry.label} ${entry.keywords ?? ""} ${entry.href}`}
                  onSelect={() => go(entry.href)}
                  onMouseEnter={() => prefetchRoute(entry.href)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{entry.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Tips">
            <CommandItem disabled value="tip-search">
              Tip: press ⌘K / Ctrl+K anytime on desktop
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
