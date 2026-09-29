import { Link } from "wouter";
import { Search, Package, CreditCard, User, Zap, MessageCircle, ShieldCheck, HelpCircle, ArrowRight } from "lucide-react";

const categories = [
  {
    icon: Package,
    title: "Kòmann & Livrezon",
    color: "bg-blue-500/10 text-blue-500",
    articles: [
      { title: "Kijan pou pase yon kòmann", href: "/faq#orders" },
      { title: "Swiv livrezon mwen", href: "/faq#tracking" },
      { title: "Pwodwi pa rive — kisa pou fè", href: "/refund-policy" },
      { title: "Retounen yon pwodwi", href: "/refund-policy" },
    ],
  },
  {
    icon: CreditCard,
    title: "Peman & Pòtfèy",
    color: "bg-green-500/10 text-green-500",
    articles: [
      { title: "Kijan pou recharje pòtfèy mwen", href: "/faq#wallet" },
      { title: "Retire lajan (MonCash / Bankè)", href: "/faq#withdrawal" },
      { title: "Pwoblèm ak peman Stripe", href: "/faq#stripe" },
      { title: "Balans pwomos — kijan sa travay", href: "/faq#promo" },
    ],
  },
  {
    icon: Zap,
    title: "Boost & Pwomosyon",
    color: "bg-orange-500/10 text-orange-500",
    articles: [
      { title: "Boost pwodwi ou", href: "/faq#boost" },
      { title: "Videyo promo — kijan kreye", href: "/faq#video" },
      { title: "Mes Boosts Actifs", href: "/my-boosts" },
      { title: "Boost pa parèt — debugger", href: "/faq#boost-debug" },
    ],
  },
  {
    icon: User,
    title: "Kont & Pwofil",
    color: "bg-purple-500/10 text-purple-500",
    articles: [
      { title: "Chanje modpas mwen", href: "/settings/security" },
      { title: "Verifikasyon telefòn (OTP)", href: "/faq#otp" },
      { title: "Efase kont mwen", href: "/delete-account" },
      { title: "Rekipere kont ou bloke", href: "/auth/forgot-password" },
    ],
  },
  {
    icon: ShieldCheck,
    title: "Sekirite & Sekirite",
    color: "bg-red-500/10 text-red-500",
    articles: [
      { title: "Rapòte yon eskwòk", href: "/report-abuse" },
      { title: "Pwodwi entèdi", href: "/prohibited-items" },
      { title: "Kont mwen pirate", href: "/safety" },
      { title: "Règ kominote yo", href: "/community-guidelines" },
    ],
  },
  {
    icon: MessageCircle,
    title: "Vann sou FLEXA MARKET",
    color: "bg-yellow-500/10 text-yellow-500",
    articles: [
      { title: "Kreye premye anons ou", href: "/sell" },
      { title: "Règ pou vandè", href: "/seller-policy" },
      { title: "Abonnman vendè (plans)", href: "/subscription" },
      { title: "Retrè lajan kont vandè", href: "/faq#withdrawal" },
    ],
  },
];

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.15),transparent_65%)]" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-16 text-center">
          <span className="inline-block bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full mb-4">Sant Èd</span>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">Kijan nou ka ede w?</h1>
          <p className="text-white/60 text-sm mb-8">Jwenn repons imedyatman pou kesyon ki pi komen yo.</p>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-full shadow-xl hover:opacity-90 transition-opacity"
          >
            <Search className="h-4 w-4" />
            Gade FAQ konplè a
          </Link>
        </div>
      </div>

      {/* Categories grid */}
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-lg font-bold text-foreground mb-6">Kategori sipò</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {categories.map(cat => (
            <div key={cat.title} className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-foreground text-sm">{cat.title}</h3>
              </div>
              <ul className="space-y-2">
                {cat.articles.map(art => (
                  <li key={art.title}>
                    <Link
                      href={art.href}
                      className="flex items-center justify-between text-sm text-muted-foreground hover:text-primary transition-colors group"
                    >
                      {art.title}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Still need help */}
        <div className="mt-10 p-6 rounded-2xl bg-primary/5 border border-primary/15 text-center">
          <HelpCircle className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="font-bold text-foreground mb-1">Ou poko jwenn repons ou?</h3>
          <p className="text-sm text-muted-foreground mb-4">Ekip sipò nou disponib pou reponn ou nan 24 è.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/support"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white font-bold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Chat ak sipò
            </Link>
            <a
              href="mailto:support@flexamarket.com"
              className="inline-flex items-center justify-center gap-2 border border-primary text-primary font-bold px-5 py-2.5 rounded-full hover:bg-primary/10 transition-colors text-sm"
            >
              Ekri yon email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
