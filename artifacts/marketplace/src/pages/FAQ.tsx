import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

const FAQ_IDS = [
  { id: "what-is", qKey: "faq.whatIsQ", aKey: "faq.whatIsA", catKey: "faq.catGeneral" },
  { id: "who-can-use", qKey: "faq.whoCanUseQ", aKey: "faq.whoCanUseA", catKey: "faq.catGeneral" },
  { id: "is-free", qKey: "faq.isFreeQ", aKey: "faq.isFreeA", catKey: "faq.catGeneral" },
  { id: "otp", qKey: "faq.otpQ", aKey: "faq.otpA", catKey: "faq.catAccount" },
  { id: "forgot-password", qKey: "faq.forgotPasswordQ", aKey: "faq.forgotPasswordA", catKey: "faq.catAccount" },
  { id: "delete-account", qKey: "faq.deleteAccountQ", aKey: "faq.deleteAccountA", catKey: "faq.catAccount" },
  { id: "orders", qKey: "faq.ordersQ", aKey: "faq.ordersA", catKey: "faq.catBuying" },
  { id: "tracking", qKey: "faq.trackingQ", aKey: "faq.trackingA", catKey: "faq.catBuying" },
  { id: "refund", qKey: "faq.refundQ", aKey: "faq.refundA", catKey: "faq.catBuying" },
  { id: "create-listing", qKey: "faq.createListingQ", aKey: "faq.createListingA", catKey: "faq.catSelling" },
  { id: "withdrawal", qKey: "faq.withdrawalQ", aKey: "faq.withdrawalA", catKey: "faq.catSelling" },
  { id: "wallet", qKey: "faq.walletQ", aKey: "faq.walletA", catKey: "faq.catWallet" },
  { id: "promo", qKey: "faq.promoQ", aKey: "faq.promoA", catKey: "faq.catWallet" },
  { id: "boost", qKey: "faq.boostQ", aKey: "faq.boostA", catKey: "faq.catBoost" },
  { id: "video", qKey: "faq.videoQ", aKey: "faq.videoA", catKey: "faq.catBoost" },
  { id: "boost-debug", qKey: "faq.boostDebugQ", aKey: "faq.boostDebugA", catKey: "faq.catBoost" },
] as const;

const CAT_KEYS = [
  "faq.catGeneral",
  "faq.catAccount",
  "faq.catBuying",
  "faq.catSelling",
  "faq.catWallet",
  "faq.catBoost",
] as const;

export default function FAQ() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const faqs = useMemo(
    () =>
      FAQ_IDS.map(item => ({
        id: item.id,
        question: t(item.qKey),
        answer: t(item.aKey),
        category: t(item.catKey),
        catKey: item.catKey,
      })),
    [t],
  );

  const categoryTabs = useMemo(
    () => [{ key: "all", label: t("faq.all") }, ...CAT_KEYS.map(key => ({ key, label: t(key) }))],
    [t],
  );

  const filtered = faqs.filter(f => {
    const matchCat = activeCategory === "all" || f.catKey === activeCategory;
    const q = search.toLowerCase();
    const matchSearch =
      search === "" ||
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12),transparent_60%)]" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-14 text-center">
          <span className="inline-block bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full mb-4">
            {t("faq.badge")}
          </span>
          <h1 className="text-3xl font-black text-white mb-3">{t("faq.title")}</h1>
          <p className="text-white/60 text-sm mb-6">{t("faq.subtitle")}</p>
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder={t("faq.searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 mb-6">
          {categoryTabs.map(cat => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                activeCategory === cat.key
                  ? "bg-primary text-white shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{t("faq.noResults")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(faq => (
              <div key={faq.id} id={faq.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(open === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="font-semibold text-sm text-foreground">{faq.question}</span>
                  {open === faq.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {open === faq.id && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">{t("faq.needMore")}</p>
          <Link
            href="/support"
            className="inline-flex items-center justify-center min-h-10 bg-primary text-white font-bold px-5 py-2.5 rounded-md text-sm hover:opacity-90"
          >
            {t("faq.contactSupport")}
          </Link>
        </div>
      </div>
    </div>
  );
}
