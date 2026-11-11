import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  User as UserIcon,
  ShieldCheck,
  Bell,
  Palette,
  HelpCircle,
  ChevronRight,
  LogOut,
  Shield,
  Plus,
  Play,
  Megaphone,
  CreditCard,
  Tag,
  BarChart3,
  Film,
  Lock,
  Pencil,
  Info,
  Layers,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetchRoutes";

interface SettingsRow {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  to: string;
  testid?: string;
  tone?: "emerald" | "blue" | "amber" | "violet" | "rose" | "slate" | "orange";
  highlight?: boolean;
}

const TONE: Record<NonNullable<SettingsRow["tone"]>, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

export default function Settings() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const countryFlag = user.country ? (COUNTRY_FLAGS[user.country] ?? "🌍") : "🌍";

  const menuRows: SettingsRow[] = [
    {
      icon: UserIcon,
      label: t("accountCenter.profileIdentity"),
      sub: t("accountCenter.profileIdentitySub"),
      to: "/settings/identity",
      testid: "row-profile-identity",
      tone: "blue",
    },
    {
      icon: ShieldCheck,
      label: t("accountCenter.securityLogin"),
      sub: t("accountCenter.securityLoginSub"),
      to: "/settings/security",
      testid: "row-security",
      tone: "violet",
    },
    {
      icon: MapPin,
      label: t("checkout.savedAddresses", { defaultValue: "Delivery addresses" }),
      sub: t("checkout.savedAddressesHint", {
        defaultValue: "Saved addresses reused automatically at checkout",
      }),
      to: "/settings/addresses",
      testid: "row-addresses",
      tone: "blue",
    },
    {
      icon: CreditCard,
      label: t("accountCenter.paymentsWithdrawals"),
      sub: t("accountCenter.paymentsWithdrawalsSub"),
      to: "/settings/payments",
      testid: "row-payments",
      tone: "emerald",
    },
    {
      icon: Tag,
      label: t("accountCenter.myListings"),
      sub: t("accountCenter.myListingsSub"),
      to: `/profile/${user.id}`,
      testid: "row-my-listings",
      tone: "amber",
    },
    {
      icon: Megaphone,
      label: t("accountCenter.myBoosts"),
      sub: t("accountCenter.myBoostsSub"),
      to: "/booster",
      testid: "row-my-boosts",
      tone: "orange",
    },
    {
      icon: Film,
      label: t("accountCenter.myVideos"),
      sub: t("accountCenter.myVideosSub"),
      to: "/settings/videos",
      testid: "row-my-videos",
      tone: "violet",
    },
    {
      icon: BarChart3,
      label: t("accountCenter.analytics"),
      sub: t("accountCenter.analyticsSub"),
      to: "/settings/analytics",
      testid: "row-analytics",
      tone: "emerald",
      highlight: true,
    },
    {
      icon: Bell,
      label: t("accountCenter.notifications"),
      sub: t("accountCenter.notificationsSub"),
      to: "/settings/notifications",
      testid: "row-notifications",
      tone: "blue",
    },
    {
      icon: Lock,
      label: t("accountCenter.privacy"),
      sub: t("accountCenter.privacySub"),
      to: "/settings/privacy",
      testid: "row-privacy",
      tone: "slate",
    },
    {
      icon: Palette,
      label: t("accountCenter.appearance"),
      sub: t("accountCenter.appearanceSub"),
      to: "/settings/preferences",
      testid: "row-appearance",
      tone: "rose",
    },
    {
      icon: HelpCircle,
      label: t("settings.helpSupport"),
      sub: t("settings.helpSupportSub"),
      to: "/settings/help",
      testid: "row-help",
      tone: "slate",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      {/* Profile card */}
      <Card className="overflow-hidden rounded-2xl border-border">
        <div className="p-4 flex items-center gap-3">
          <Avatar className="h-14 w-14">
            <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
            <AvatarFallback className="bg-[hsl(152,65%,18%)] text-white font-bold">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base truncate" data-testid="text-settings-user-name">{user.name}</p>
            <p className="text-sm text-muted-foreground truncate" data-testid="text-settings-user-email">{user.email}</p>
            {user.isVerified && (
              <span className="inline-flex items-center mt-1 text-xs font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                ✓ {t("settings.verified")}
              </span>
            )}
          </div>
          <Link
            href="/profile/edit"
            onMouseEnter={() => prefetchRoute("/profile/edit")}
            onFocus={() => prefetchRoute("/profile/edit")}
            className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-accent"
            aria-label={t("settings.editProfile")}
            data-testid="button-edit-profile"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </div>
        {user.country && (
          <div className="mx-4 mb-4 rounded-xl bg-muted/70 px-3 py-2.5 flex items-center gap-2 text-sm">
            <span aria-hidden>{countryFlag}</span>
            <span className="flex-1 text-muted-foreground">
              {t("accountCenter.accountCountry")}: <span className="font-medium text-foreground">{user.country}</span>
            </span>
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        )}
      </Card>

      {/* Quick actions — 2×2 on narrow screens, 4-col from sm up */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Link
          href="/sell"
          className="min-h-[76px] rounded-2xl bg-[hsl(152,65%,18%)] text-white flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center shadow-sm"
          data-testid="button-settings-add-product"
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span className="text-[11px] font-semibold leading-tight">{t("settings.addProduct")}</span>
        </Link>
        <Link
          href="/settings/videos"
          className="min-h-[76px] rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 border border-sky-100 dark:border-sky-900 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center"
          data-testid="button-settings-my-videos"
        >
          <Play className="h-5 w-5 text-violet-600" aria-hidden />
          <span className="text-[11px] font-semibold leading-tight">{t("accountCenter.quickVideos")}</span>
        </Link>
        <Link
          href="/booster"
          className="min-h-[76px] rounded-2xl bg-orange-50 dark:bg-orange-950/30 text-orange-900 dark:text-orange-100 border border-orange-100 dark:border-orange-900 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center"
          data-testid="button-settings-my-boosts"
        >
          <Megaphone className="h-5 w-5 text-orange-500" aria-hidden />
          <span className="text-[11px] font-semibold leading-tight">{t("accountCenter.quickBoosts")}</span>
        </Link>
        <Link
          href="/my-drafts"
          className="relative min-h-[76px] rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-violet-950 dark:text-violet-100 border border-violet-100 dark:border-violet-900 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center"
          data-testid="button-settings-my-drafts"
        >
          <span className="absolute top-1.5 right-1.5 text-[9px] font-black uppercase tracking-wide bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
            {t("myDrafts.newBadge", { defaultValue: "New" })}
          </span>
          <Layers className="h-5 w-5 text-violet-600" aria-hidden />
          <span className="text-[11px] font-semibold leading-tight">{t("accountCenter.quickDrafts", { defaultValue: "My Drafts" })}</span>
        </Link>
      </div>

      {/* Menu */}
      <Card className="overflow-hidden rounded-2xl divide-y divide-border">
        {menuRows.map(({ icon: Icon, label, sub, to, testid, tone = "blue", highlight }) => (
          <Link key={to + label} href={to}>
            <button
              type="button"
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-3.5 hover:bg-accent/60 transition-colors text-left min-h-[56px]",
                highlight && "bg-emerald-50/80 dark:bg-emerald-950/20",
              )}
              data-testid={testid}
            >
              <div className={cn("rounded-xl p-2.5 flex-shrink-0", TONE[tone])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{label}</p>
                {sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          </Link>
        ))}
      </Card>

      {(user.isAdmin || (user as { isSuperAdmin?: boolean }).isSuperAdmin) && (
        <Card className="overflow-hidden rounded-2xl">
          <Link href="/admin">
            <button type="button" className="w-full flex items-center gap-3 px-3.5 py-3.5 hover:bg-accent text-left" data-testid="row-admin">
              <div className="rounded-xl p-2.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t("settings.adminPanel")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.adminPanelSub")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>
        </Card>
      )}

      <Card className="overflow-hidden rounded-2xl">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors min-h-11"
          data-testid="button-settings-logout"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-semibold">{t("buttons.logout")}</span>
        </button>
      </Card>

      <p className="text-center text-xs text-muted-foreground pt-1">FLEXA MARKET</p>
    </div>
  );
}
