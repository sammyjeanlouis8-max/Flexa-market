import LegalLayout from "@/components/LegalLayout";
import { Cookie } from "lucide-react";

const sections = [
  {
    id: "what-are-cookies",
    title: "Kisa cookies ye?",
    content: (
      <p>Cookies se ti fichye tèks ke sit entènèt yo estoke sou aparèy ou. Yo ede nou sonje preferans ou, kenbe sesyon ou ouvert, epi amelyore eksperyans ou a. FLEXA MARKET itilize cookies ak teknoloji similè (localStorage, sessionStorage) pou menm rezon yo.</p>
    ),
  },
  {
    id: "types",
    title: "Kalite cookies nou itilize",
    content: (
      <div className="not-prose space-y-3">
        {[
          {
            type: "✅ Cookies Esansyèl",
            desc: "Nesesè pou platfòm nan fonksyone. Ou pa ka dezaktive yo.",
            examples: ["Sesyon otantifikasyon (JWT token)", "Preferans lang (en/fr/ht)", "Paramèt tema (klè/fènwa)"],
          },
          {
            type: "📊 Cookies Analitik",
            desc: "Ede nou konprann kijan moun itilize sit la.",
            examples: ["Paj ou vizite", "Tan ou pase sou sit la", "Erè teknik"],
          },
          {
            type: "🎯 Cookies Fonksyonèl",
            desc: "Sonje preferans ou pou eksperyans miyò.",
            examples: ["Rezilta rechèch dènye", "Anons ou te gade", "Paramèt ou chwazi"],
          },
        ].map(({ type, desc, examples }) => (
          <div key={type} className="p-4 rounded-xl border border-border bg-card">
            <p className="font-bold text-foreground text-sm mb-1">{type}</p>
            <p className="text-xs text-muted-foreground mb-2">{desc}</p>
            <ul className="space-y-0.5">
              {examples.map(ex => <li key={ex} className="text-xs text-muted-foreground/70">• {ex}</li>)}
            </ul>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "no-third-party",
    title: "Cookies tiyè",
    content: (
      <p>FLEXA MARKET <strong>pa</strong> vann done ou bay reklam tiyè. Nou pa itilize Google Ads, Facebook Pixel, oswa platfòm trase konpòtman komèsyal. Tout analitik fèt ann entèn.</p>
    ),
  },
  {
    id: "manage",
    title: "Kijan pou jere cookies ou",
    content: (
      <>
        <p>Ou ka kontwole cookies nan:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li><strong>Navigatè ou:</strong> Tout navigatè modèn ofri opsyon pou bloke oswa efase cookies</li>
          <li><strong>Paramèt FLEXA MARKET:</strong> Ale nan Paramèt → Konfidansyalite</li>
          <li><strong>Efase done:</strong> Ou ka efase tout done lokal nan parametm aplikasyon an</li>
        </ul>
        <p className="mt-2 text-sm">⚠️ Dezaktive cookies esansyèl yo ka anpeche ou konekte nan kont ou.</p>
      </>
    ),
  },
  {
    id: "updates",
    title: "Chanjman nan règ cookies",
    content: (
      <p>Nou ka mete ajou règ cookies sa a nenpòt ki lè. Nou pral avize ou via email oswa yon notifikasyon sou platfòm nan si chanjman yo enpòtan. Itilize kontinyèl platfòm nan aprè chanjman yo vle di ou aksepte yo.</p>
    ),
  },
];

export default function Cookies() {
  return (
    <LegalLayout
      icon={<Cookie className="h-6 w-6" />}
      badge="Cookies"
      title="Règ Cookies"
      subtitle="Kijan nou itilize cookies ak teknoloji similè."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
