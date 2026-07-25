import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { ChevronLeft, ChevronDown, Mail, FileText, Shield, ExternalLink, MessageSquare } from "lucide-react";

/**
 * Help & Support page. Static content — collapsible FAQ rows plus a
 * contact card and links to Terms/Privacy. Kept here (not in a CMS)
 * because the answers rarely change and a single page keeps the
 * support bundle predictable. If we add a CMS later, swap the
 * `FAQS` array for a fetch.
 */
const FAQS_KEYS = [
  { qKey: "settings.faq1Q", aKey: "settings.faq1A" },
  { qKey: "settings.faq2Q", aKey: "settings.faq2A" },
  { qKey: "settings.faq3Q", aKey: "settings.faq3A" },
  { qKey: "settings.faq4Q", aKey: "settings.faq4A" },
  { qKey: "settings.faq5Q", aKey: "settings.faq5A" },
];

export default function SettingsHelp() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState<number | null>(0);

  // Help lives under /settings, so gate it behind auth like the other
  // sub-pages. Public help content (Terms/Privacy) has its own routes.
  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center" data-testid="help-login-required">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      <button
        onClick={() => setLocation("/settings")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back-settings"
      >
        <ChevronLeft className="h-4 w-4" /> {t("settings.backToSettings")}
      </button>

      <h1 className="text-2xl font-bold">{t("settings.helpSupport")}</h1>
      <p className="text-sm text-muted-foreground">{t("settings.helpIntro")}</p>

      {/* In-app support chat — primary contact path */}
      <Card className="p-5 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground rounded-full p-3">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{t("support.title", { defaultValue: "Sipò" })}</p>
            <p className="text-sm text-muted-foreground">
              {t("support.intro", {
                defaultValue: "Voye yon mesaj bay ekip FLEXA MARKET la. N ap reponn ou pi vit posib.",
              })}
            </p>
          </div>
          <Button
            onClick={() => setLocation("/support")}
            data-testid="button-open-support"
            size="sm"
          >
            {t("support.openChat", { defaultValue: "Louvri chat" })}
          </Button>
        </div>
      </Card>

      {/* Email fallback for legacy / external contact */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="bg-muted text-muted-foreground rounded-full p-2">
            <Mail className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{t("settings.contactSupport")}</p>
            <p className="text-xs text-muted-foreground">support@flexamarket.com</p>
          </div>
          <a
            href="mailto:support@flexamarket.com"
            className="text-xs font-semibold text-primary hover:underline"
            data-testid="link-email-support"
          >
            {t("settings.emailUs")}
          </a>
        </div>
      </Card>

      {/* FAQ */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">
          {t("settings.faq")}
        </h2>
        <Card className="divide-y divide-border overflow-hidden">
          {FAQS_KEYS.map(({ qKey, aKey }, i) => (
            <button
              key={qKey}
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full p-4 text-left hover:bg-accent transition-colors"
              data-testid={`faq-${i}`}
            >
              <div className="flex items-start gap-2">
                <span className="flex-1 font-medium text-sm">{t(qKey)}</span>
                <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform mt-0.5 ${open === i ? "rotate-180" : ""}`} />
              </div>
              {open === i && (
                <p className="mt-2 text-sm text-muted-foreground">{t(aKey)}</p>
              )}
            </button>
          ))}
        </Card>
      </div>

      {/* Legal links */}
      <Card className="divide-y divide-border overflow-hidden">
        <a
          href="#"
          className="flex items-center gap-3 p-4 hover:bg-accent transition-colors"
          data-testid="link-terms"
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm">{t("settings.terms")}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </a>
        <a
          href="#"
          className="flex items-center gap-3 p-4 hover:bg-accent transition-colors"
          data-testid="link-privacy"
        >
          <Shield className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm">{t("settings.privacy")}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </a>
      </Card>

      <p className="text-center text-xs text-muted-foreground pt-2">
        FLEXA MARKET
      </p>
    </div>
  );
}
