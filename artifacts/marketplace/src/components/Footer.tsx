import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Mail, MapPin } from "lucide-react";

/**
 * Site-wide footer. Sits below the main content on every page. On mobile we
 * leave extra bottom padding so the fixed bottom-nav doesn't overlap it.
 *
 * Link columns adapt to auth state — signed-in users see Account links
 * (Profile, Sales, Orders, Settings); guests see Sign-in / Sign-up.
 */
export default function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const year = new Date().getFullYear();

  const exploreLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/search", label: t("nav.search") },
    { href: "/sell", label: t("nav.sell") },
    { href: "/jobs", label: t("nav.jobs") },
  ];

  const accountLinks = user
    ? [
        { href: `/profile/${user.id}`, label: t("nav.profile") },
        { href: "/sales", label: t("footer.sales", { defaultValue: "Sales" }) },
        { href: "/orders", label: t("footer.orders", { defaultValue: "Orders" }) },
        { href: "/settings", label: t("footer.settings", { defaultValue: "Settings" }) },
      ]
    : [
        { href: "/auth/login", label: t("nav.signIn") },
        { href: "/auth/signup", label: t("footer.signUp", { defaultValue: "Sign up" }) },
      ];

  const helpLinks = [
    { href: "/settings/help", label: t("footer.help", { defaultValue: "Help center" }) },
    { href: "/settings/notifications", label: t("footer.notifications", { defaultValue: "Notifications" }) },
    { href: "/settings/preferences", label: t("footer.preferences", { defaultValue: "Preferences" }) },
    { href: "/settings/security", label: t("footer.security", { defaultValue: "Security" }) },
  ];

  return (
    <footer
      className="border-t border-border bg-card mt-12 pb-24 md:pb-8"
      data-testid="site-footer"
    >
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <Link
              href="/"
              className="flex items-center"
              data-testid="footer-brand"
              aria-label="FLEXA MARKET home"
            >
              <img src="/logo.png" alt="FLEXA MARKET" className="h-44 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {t("footer.tagline", {
                defaultValue: "The community marketplace — buy, sell, and find work near you.",
              })}
            </p>
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                support@flexamarket.com
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Pòtoprens · Miami · Montréal
              </span>
            </div>
          </div>

          {/* Explore */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {t("footer.explore", { defaultValue: "Explore" })}
            </h3>
            <ul className="space-y-2">
              {exploreLinks.map(l => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`footer-link-${l.href.replace(/\//g, "-").slice(1) || "home"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {t("footer.account", { defaultValue: "Account" })}
            </h3>
            <ul className="space-y-2">
              {accountLinks.map(l => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`footer-link-account-${l.href.split("/").pop()}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {t("footer.helpHeading", { defaultValue: "Help & settings" })}
            </h3>
            <ul className="space-y-2">
              {helpLinks.map(l => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`footer-link-help-${l.href.split("/").pop()}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Legal & compliance links — Apple / Google Play required pages */}
        <div className="mt-8 pt-5 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            {/* Legal */}
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-widest mb-2">Legal</h4>
              <ul className="space-y-1.5">
                {[
                  { href: "/privacy-policy", label: t("footer.privacy", { defaultValue: "Privacy Policy" }), testid: "footer-link-privacy" },
                  { href: "/terms", label: t("footer.terms", { defaultValue: "Terms of Service" }), testid: "footer-link-terms" },
                  { href: "/cookies", label: "Cookies" },
                  { href: "/eula", label: "EULA" },
                  { href: "/dmca", label: "DMCA / Copyright" },
                  { href: "/accessibility", label: "Aksesiblite" },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} data-testid={l.testid} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Community */}
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-widest mb-2">Kominote</h4>
              <ul className="space-y-1.5">
                {[
                  { href: "/community-guidelines", label: "Règ Kominotè" },
                  { href: "/prohibited-items", label: "Pwodwi Entèdi" },
                  { href: "/content-policy", label: "Règ Kontni" },
                  { href: "/report-abuse", label: "Rapòte Abi" },
                  { href: "/trust-center", label: "Sant Konfyans" },
                  { href: "/safety", label: "Sekirite" },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Buyers & Sellers */}
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-widest mb-2">Achte & Vann</h4>
              <ul className="space-y-1.5">
                {[
                  { href: "/refund-policy", label: "Règ Ranbousman" },
                  { href: "/shipping-policy", label: "Règ Livrezon" },
                  { href: "/seller-policy", label: "Règ Vandè" },
                  { href: "/about", label: "Sou Nou" },
                  { href: "/contact", label: t("footer.contactSupport", { defaultValue: "Contact Support" }), testid: "footer-link-contact" },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} data-testid={(l as { testid?: string }).testid} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Support */}
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-widest mb-2">{t("footer.supportSection")}</h4>
              <ul className="space-y-1.5">
                {[
                  { href: "/help-center", label: t("footer.helpCenter") },
                  { href: "/faq", label: "FAQ" },
                  { href: "/support", label: t("footer.chatSupport") },
                  { href: "/delete-account", label: t("footer.deleteAccount") },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs text-muted-foreground" data-testid="footer-copyright">
            © {year} FLEXA MARKET. {t("footer.rights", { defaultValue: "All rights reserved." })}
          </p>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="icon" align="end" />
            <span className="text-xs text-muted-foreground">
              {t("footer.madeIn", { defaultValue: "Made with ❤ in Haiti" })}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
