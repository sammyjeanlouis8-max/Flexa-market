import LegalLayout from "@/components/LegalLayout";
import { Shield } from "lucide-react";

const TipCard = ({ emoji, title, tips }: { emoji: string; title: string; tips: string[] }) => (
  <div className="not-prose p-4 rounded-xl border border-border bg-card">
    <p className="font-bold text-foreground text-sm mb-2">{emoji} {title}</p>
    <ul className="space-y-1.5">
      {tips.map(tip => <li key={tip} className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="text-green-500 shrink-0">✓</span>{tip}</li>)}
    </ul>
  </div>
);

const sections = [
  {
    id: "intro",
    title: "Sekirite ou enpòtan pou nou",
    content: (
      <p>FLEXA MARKET travay di pou pwoteje chak moun sou platfòm nan. Men tou, ou jwe yon wòl enpòtan nan pwòp sekirite ou. Suiv konsèy sa yo pou rete an sekirite.</p>
    ),
  },
  {
    id: "account-safety",
    title: "Sekirite kont",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <TipCard emoji="🔐" title="Pwoteje kont ou" tips={[
          "Itilize yon modpas solid ak inik (12+ karaktè)",
          "Aktive verifikasyon 2 etap (OTP)",
          "Pa pataje modpas ou ak pèsonn",
          "Dekonekte sou aparèy ou pa itilize ankò",
          "Verifye email ak telefòn ou yo",
        ]} />
      </div>
    ),
  },
  {
    id: "transaction-safety",
    title: "Sekirite tranzaksyon",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <TipCard emoji="💰" title="Peman an sekirite" tips={[
          "Toujou itilize sistèm peman FLEXA MARKET — pa janm peye deyò platfòm nan",
          "Méfye ou si vandè mande peman dirèk (MonCash pa platfòm, Western Union, etc.)",
          "Verifye nimewo telefòn vandè avan peman",
          "Pa janm voye avans nan lajan san garanti",
        ]} />
        <TipCard emoji="📦" title="Achte an sekirite" tips={[
          "Li komantè ak evalyasyon vandè yo avan achte",
          "Poze kesyon sou pwodwi a si ou pa klè",
          "Verifye foto yo ak deskripsyon an",
          "Pa konfime livrezon si ou pa resevwa pwodwi a",
        ]} />
      </div>
    ),
  },
  {
    id: "meeting-safety",
    title: "Rankontre an pèsòn",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <TipCard emoji="🤝" title="Si ou rannte ak yon vandè/aketè" tips={[
          "Chwazi yon kote piblik ak moun (kafe, bank, makèt)",
          "Avize yon zanmi oswa manm fanmi ki kote ou prale",
          "Fè tranzaksyon pandan lajounen",
          "Evite vwayaje sèl nan zòn ou pa konnen",
          "Sere nimewo ijans lokal",
        ]} />
      </div>
    ),
  },
  {
    id: "red-flags",
    title: "Siy alavètis (Red Flags)",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Prix ki <em>twò bon pou vre</em> — ki twò ba pase mache nòmal</li>
        <li>Vandè ki mande peman deyò platfòm FLEXA MARKET</li>
        <li>Presyon pou peye rapid san gade pwodwi a</li>
        <li>Pwodwi ki pa gen foto reyèl (foto stock sèlman)</li>
        <li>Vandè ki refize reponn kesyon sou pwodwi a</li>
        <li>Kont ki fèk kreye ak zewo komantè</li>
      </ul>
    ),
  },
  {
    id: "report",
    title: "Si ou santi ou an danje",
    content: (
      <>
        <p>Si ou wè oswa eksperyanse nenpòt situasyon ki danje:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Kontakte ijans lokal (110, 114, 118 nan Ayiti)</li>
          <li>Rapòte sou FLEXA MARKET via bouton "Rapòte"</li>
          <li>Ekri nou: <strong>safety@flexamarket.com</strong></li>
        </ul>
      </>
    ),
  },
];

export default function Safety() {
  return (
    <LegalLayout
      icon={<Shield className="h-6 w-6" />}
      badge="Sekirite"
      title="Sekirite sou FLEXA MARKET"
      subtitle="Konsèy pratik pou rete an sekirite lè w achte ak vann."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
