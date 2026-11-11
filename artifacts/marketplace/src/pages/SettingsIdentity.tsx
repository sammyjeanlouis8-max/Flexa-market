import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  ArrowLeft, User, Camera, MapPin, BadgeCheck, FileText, ChevronRight, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { prefetchRoute } from "@/lib/prefetchRoutes";

export default function SettingsIdentity() {
  const { user } = useAuth();
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

  const rows = [
    {
      icon: Pencil,
      label: t("accountCenter.personalInfo"),
      sub: t("accountCenter.personalInfoSub"),
      to: "/profile/edit",
    },
    {
      icon: Camera,
      label: t("accountCenter.profilePhoto"),
      sub: t("accountCenter.profilePhotoSub"),
      to: "/profile/edit",
    },
    {
      icon: FileText,
      label: t("accountCenter.biography"),
      sub: user.bio?.trim() ? user.bio : t("accountCenter.biographyEmpty"),
      to: "/profile/edit",
    },
    {
      icon: MapPin,
      label: t("accountCenter.registeredCountry"),
      sub: user.country
        ? `${countryFlag} ${user.country}`
        : t("accountCenter.countryMissing"),
      to: "/profile/edit",
    },
    {
      icon: BadgeCheck,
      label: t("accountCenter.identityVerification"),
      sub: user.isVerified
        ? t("settings.verified")
        : t("accountCenter.identityVerificationSub"),
      to: "/kyc",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.profileIdentity")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.profileIdentitySub")}</p>
        </div>
      </div>

      <Card className="rounded-2xl p-4 flex items-center gap-3">
        <Avatar className="h-14 w-14">
          <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
          <AvatarFallback className="bg-[hsl(152,65%,18%)] text-white font-bold">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{user.name}</p>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
        <User className="h-4 w-4 text-muted-foreground" aria-hidden />
      </Card>

      <Card className="rounded-2xl overflow-hidden divide-y divide-border">
        {rows.map(({ icon: Icon, label, sub, to }) => (
          <Link
            key={label}
            href={to}
            onMouseEnter={() => prefetchRoute(to)}
            onFocus={() => prefetchRoute(to)}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent min-h-11"
          >
            <div className="h-9 w-9 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground truncate">{sub}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
