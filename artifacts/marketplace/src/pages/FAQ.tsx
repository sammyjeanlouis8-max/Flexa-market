import { useState } from "react";
import { ChevronDown, ChevronUp, Search, HelpCircle } from "lucide-react";
import { Link } from "wouter";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  // General
  { id: "what-is", category: "Jeneral", question: "Kisa FLEXA MARKET ye?", answer: "FLEXA MARKET se yon platfòm achte-vann kominotè pou Ayiti ak dyaspora ayisyen an. Ou ka achte ak vann tout kalite pwodwi, jwenn djòb, ak konekte ak moun nan zòn ou a." },
  { id: "who-can-use", category: "Jeneral", question: "Ki moun ki ka itilize FLEXA MARKET?", answer: "Nenpòt moun ki gen 18 an ak plis, ki gen yon nimewo telefòn valab ak yon adres email. Platfòm nan disponib nan Ayiti, Florid, Kanada, Lafrans, ak lòt peyi." },
  { id: "is-free", category: "Jeneral", question: "Eske FLEXA MARKET gratis?", answer: "Enskripsyon an gratis. Kreye anons gratis tou (nan Plan Baz). Nou chaje yon komisyon piti sou sèten vant ak nou ofri plan payant pou vandè ki vle plis fonksyon." },
  // Account
  { id: "otp", category: "Kont", question: "M pa resevwa kòd OTP mwen", answer: "Verifye: 1) Nimewo telefòn ou antre a kòrèk? 2) Ou gen sèvis SMS? 3) Kòd la ekspire apre 5 minit — mande yon lòt. Si pwoblèm kontinye, klike sou 'Eseye lòt fason' pou itilize email oswa kesyon sekirite." },
  { id: "forgot-password", category: "Kont", question: "Mwen bliye modpas mwen", answer: "Ale nan Konekte → 'Bliye modpas'. Antre email ou oswa nimewo telefòn. Ou pral resevwa yon kòd OTP. Si ou pa ka resevwa OTP, ou ka itilize kesyon sekirite ou te konfigire a." },
  { id: "delete-account", category: "Kont", question: "Kijan pou efase kont mwen?", answer: "Ale nan Paramèt → Sekirite → 'Efase kont mwen'. Oswa vizite /delete-account pou enstriksyon konplè. Kont efase pèmanman apre 30 jou." },
  // Buying
  { id: "orders", category: "Achte", question: "Kijan sistèm kòmann nan travay?", answer: "Lè ou achte yon pwodwi, lajan ou blokan nan escrow. Vandè voye kòmann lan. Lè ou konfime resepsyon an, lajan lib pou vandè a. Si ou pa resevwa li, ouvri yon dispit." },
  { id: "tracking", category: "Achte", question: "Kijan pou swiv kòmann mwen?", answer: "Ale nan 'Kòmann mwen' → chwazi kòmann lan. Si vandè bay yon nimewo swivi transpòtè, ou pral wè li la. Pou livrezon Ayiti, kontakte vandè dirèkteman via mesaj." },
  { id: "refund", category: "Achte", question: "Kijan pou mande ranbousman?", answer: "Ale nan 'Kòmann mwen' → 'Ouvri yon dispit'. Founi prèv (foto, screenshot). Ekip nou revize nan 48 è. Si ranbousman apwouve, ou resevwa lajan nan 1–7 jou depann de metòd peman ou." },
  // Selling
  { id: "create-listing", category: "Vann", question: "Kijan pou kreye premye anons mwen?", answer: "Klike sou '+' oswa 'Vann' nan navigasyon an. Ajoute foto pwodwi ou (minimòm 1), titre, deskripsyon, prix, eta pwodwi a, ak lokalizasyon. Pibliye epi ann ale!" },
  { id: "withdrawal", category: "Vann", question: "Kijan pou retire lajan mwen?", answer: "Ale nan Pòtfèy → Retire. Chwazi metòd peman ou (MonCash oswa virement). Asire ou te verifye kont peman ou nan Paramèt → Kont peman. Retrè pwosese nan 1–7 jou ouvrab." },
  // Wallet
  { id: "wallet", category: "Pòtfèy", question: "Kijan pou recharje pòtfèy mwen?", answer: "Ale nan Pòtfèy → Recharje. Chwazi MonCash, Stripe (kat kredi), oswa USDT. Swiv enstriksyon yo. Minimòm recharge: $5 USD." },
  { id: "promo", category: "Pòtfèy", question: "Kisa balans pwomos ye?", answer: "Balans pwomos se kredi ou jwenn via referans oswa bonifikasyon achte. Ou pa ka retire yo dirèkteman, men ou ka itilize yo pou boost pwodwi. Pou chak $20 ou depanse nan reyèl pou boost, $1 pwomos deblouke." },
  // Boost
  { id: "boost", category: "Boost", question: "Kijan pou boost yon pwodwi?", answer: "Ale nan pwodwi ou → 'Boost pwodwi sa'. Chwazi plan (durée, budget, audience). Peye via pòtfèy ou oswa kat kredi. Boost aktive imedyatman apre peman konfime." },
  { id: "video", category: "Boost", question: "Kijan pou kreye yon videyo promo?", answer: "Nan pwosesis boost la, ou ka uploade yon videyo (max 3 minit). Videyo a ap parèt nan feed 'Vidéos promotionnelles' a. Format sipòte: MP4, MOV, AVI." },
  { id: "boost-debug", category: "Boost", question: "Boost mwen pa parèt nan feed la?", answer: "Verifye: 1) Peman konfime? 2) Boost toujou aktif (pa ekspire)? 3) Tande kòd peyi audience ou a. Si tout bon, videyo feed la filtre pa peyi — yon visitè ki nan peyi cib la pral wè li." },
];

const categories = ["Tout", ...Array.from(new Set(faqs.map(f => f.category)))];

export default function FAQ() {
  const [open, setOpen] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [search, setSearch] = useState("");

  const filtered = faqs.filter(f => {
    const matchCat = activeCategory === "Tout" || f.category === activeCategory;
    const matchSearch = search === "" || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12),transparent_60%)]" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-14 text-center">
          <span className="inline-block bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full mb-4">FAQ</span>
          <h1 className="text-3xl font-black text-white mb-3">Kesyon ki poze souvan</h1>
          <p className="text-white/60 text-sm mb-6">Jwenn repons pou kesyon ki pi komen yo.</p>
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder="Chèche yon kesyon..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 mb-6">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                activeCategory === cat
                  ? "bg-primary text-white shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ items */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Pa gen rezilta pou rechèch sa a.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(faq => (
              <div key={faq.id} id={faq.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(open === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="font-semibold text-foreground text-sm">{faq.question}</span>
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    {open === faq.id
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </button>
                {open === faq.id && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 p-6 rounded-2xl bg-primary/5 border border-primary/15 text-center">
          <p className="font-bold text-foreground mb-1">Ou pa jwenn repons ou a?</p>
          <p className="text-sm text-muted-foreground mb-4">Ekip sipò nou disponib pou ede w.</p>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity text-sm"
          >
            Kontakte sipò
          </Link>
        </div>
      </div>
    </div>
  );
}
