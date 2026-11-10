import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronRight, Users, ClipboardList, Crown, AlertTriangle, Shield } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { isAdminUser, isSuperAdminUser } from "@/lib/adminCountryAccess";

type MoreItem = {
  href: string;
  title: string;
  desc: string;
  icon: typeof Users;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

/**
 * Flexa Control → More hub.
 * Users lives here (not on the bottom tab bar) for Admin / Super Admin.
 */
export default function AdminMore() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminUser(user as any);
  const isAdmin = isAdminUser(user as any);

  const items: MoreItem[] = [
    {
      href: "/admin/users",
      title: t("adminNav.users", { defaultValue: "Users" }),
      desc: t("adminUsers.moreDesc", { defaultValue: "Accounts, status, and moderation" }),
      icon: Users,
      adminOnly: true,
    },
    {
      href: "/admin/operations",
      title: t("adminNav.operations", { defaultValue: "Operations" }),
      desc: t("adminUsers.opsDesc", { defaultValue: "Queues and bulk actions" }),
      icon: ClipboardList,
    },
    {
      href: "/admin/flagged",
      title: t("adminNav.flagged", { defaultValue: "Flagged" }),
      desc: t("adminUsers.flaggedDesc", { defaultValue: "Registration risk signals" }),
      icon: AlertTriangle,
    },
    {
      href: "/admin/team",
      title: t("adminNav.admins", { defaultValue: "Admin team" }),
      desc: t("adminUsers.teamDesc", { defaultValue: "Staff roles and access" }),
      icon: Crown,
      superAdminOnly: true,
    },
    {
      href: "/admin/security",
      title: t("adminNav.security", { defaultValue: "Security" }),
      desc: t("adminUsers.securityDesc", { defaultValue: "Logs and audit trail" }),
      icon: Shield,
    },
  ];

  const visible = items.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-4" data-testid="admin-more-page">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("adminNav.more", { defaultValue: "More" })}
      </p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
        {t("adminNav.more", { defaultValue: "More" })}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("adminUsers.moreSubtitle", { defaultValue: "People, operations, and system tools" })}
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(152,40%,96%)] active:bg-[hsl(152,40%,94%)] ${
                idx > 0 ? "border-t border-border" : ""
              }`}
              data-testid={`admin-more-link-${item.href.replace(/\W+/g, "-")}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(152,45%,94%)] text-[hsl(152,65%,22%)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-foreground">{item.title}</span>
                <span className="block text-[12px] text-muted-foreground">{item.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
