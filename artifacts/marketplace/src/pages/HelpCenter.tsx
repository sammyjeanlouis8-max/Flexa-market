import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Search, Package, CreditCard, User, Zap, MessageCircle, ShieldCheck, HelpCircle, ArrowRight } from "lucide-react";

type HelpArticle = { titleKey: string; href: string };
type HelpCategory = {
  icon: typeof Package;
  titleKey: string;
  color: string;
  articles: HelpArticle[];
};

const CATEGORIES: HelpCategory[] = [
  {
    icon: Package,
    titleKey: "help.catOrders",
    color: "bg-blue-500/10 text-blue-500",
    articles: [
      { titleKey: "help.artPlaceOrder", href: "/faq#orders" },
      { titleKey: "help.artTrackDelivery", href: "/faq#tracking" },
      { titleKey: "help.artNotArrived", href: "/refund-policy" },
      { titleKey: "help.artReturnProduct", href: "/refund-policy" },
    ],
  },
  {
    icon: CreditCard,
    titleKey: "help.catPayment",
    color: "bg-green-500/10 text-green-500",
    articles: [
      { titleKey: "help.artTopUpWallet", href: "/faq#wallet" },
      { titleKey: "help.artWithdraw", href: "/faq#withdrawal" },
      { titleKey: "help.artStripeIssue", href: "/faq#stripe" },
      { titleKey: "help.artPromoBalance", href: "/faq#promo" },
    ],
  },
  {
    icon: Zap,
    titleKey: "help.catBoost",
    color: "bg-orange-500/10 text-orange-500",
    articles: [
      { titleKey: "help.artBoostProduct", href: "/faq#boost" },
      { titleKey: "help.artPromoVideo", href: "/faq#video" },
      { titleKey: "help.artActiveBoosts", href: "/my-boosts" },
      { titleKey: "help.artBoostDebug", href: "/faq#boost-debug" },
    ],
  },
  {
    icon: User,
    titleKey: "help.catAccount",
    color: "bg-purple-500/10 text-purple-500",
    articles: [
      { titleKey: "help.artChangePassword", href: "/settings/security" },
      { titleKey: "help.artPhoneOtp", href: "/faq#otp" },
      { titleKey: "help.artDeleteAccount", href: "/delete-account" },
      { titleKey: "help.artRecoverAccount", href: "/auth/forgot-password" },
    ],
  },
  {
    icon: ShieldCheck,
    titleKey: "help.catSafety",
    color: "bg-red-500/10 text-red-500",
    articles: [
      { titleKey: "help.artReportScam", href: "/report-abuse" },
      { titleKey: "help.artProhibited", href: "/prohibited-items" },
      { titleKey: "help.artHackedAccount", href: "/safety" },
      { titleKey: "help.artCommunityRules", href: "/community-guidelines" },
    ],
  },
  {
    icon: MessageCircle,
    titleKey: "help.catSell",
    color: "bg-yellow-500/10 text-yellow-500",
    articles: [
      { titleKey: "help.artCreateListing", href: "/sell" },
      { titleKey: "help.artSellerRules", href: "/seller-policy" },
      { titleKey: "help.artSellerPlans", href: "/subscription" },
      { titleKey: "help.artSellerWithdraw", href: "/faq#withdrawal" },
    ],
  },
];

export default function HelpCenter() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.15),transparent_65%)]" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 sm:py-10 text-center">
          <span className="inline-block bg-primary/20 text-primary text-xs font-bold px-2.5 py-0.5 rounded-md mb-3">
            {t("nav.helpCenter")}
          </span>
          <h1 className="text-xl md:text-2xl font-black text-white mb-2">{t("help.howCanWeHelp")}</h1>
          <p className="text-white/60 text-sm mb-5">{t("help.heroSubtitle")}</p>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 min-h-10 bg-primary text-white font-bold px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Search className="h-4 w-4" />
            {t("help.viewFullFaq")}
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <h2 className="text-base font-bold text-foreground mb-4">{t("help.supportCategories")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {CATEGORIES.map(cat => (
            <div key={cat.titleKey} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-foreground text-sm">{t(cat.titleKey)}</h3>
              </div>
              <ul className="space-y-2">
                {cat.articles.map(art => (
                  <li key={art.titleKey}>
                    <Link
                      href={art.href}
                      className="flex items-center justify-between text-sm text-muted-foreground hover:text-primary transition-colors group"
                    >
                      {t(art.titleKey)}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 sm:p-5 rounded-xl bg-primary/5 border border-primary/15 text-center">
          <HelpCircle className="h-7 w-7 text-primary mx-auto mb-2" />
          <h3 className="font-bold text-foreground mb-1">{t("help.stillNeedHelp")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("help.stillNeedHelpDesc")}</p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link
              href="/support"
              className="inline-flex items-center justify-center gap-2 min-h-10 bg-primary text-white font-bold px-4 py-2 rounded-md hover:opacity-90 transition-opacity text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              {t("help.chatSupport")}
            </Link>
            <a
              href="mailto:support@flexamarket.com"
              className="inline-flex items-center justify-center gap-2 min-h-10 border border-primary text-primary font-bold px-4 py-2 rounded-md hover:bg-primary/10 transition-colors text-sm"
            >
              {t("help.writeEmail")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
