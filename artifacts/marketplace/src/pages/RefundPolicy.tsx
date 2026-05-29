import LegalLayout from "@/components/LegalLayout";
import { RefreshCw } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "Apèsi",
    content: (
      <p>FLEXA MARKET ofri yon sistèm escrow ki pwoteje aketè ak vandè. Fondman an pa lib jiskaske livrezon konfime. Règ ranbousman yo depann de fason tranzaksyon an te fèt.</p>
    ),
  },
  {
    id: "buyer-protection",
    title: "Pwoteksyon aketè",
    content: (
      <>
        <p>Ou elijib pou yon ranbousman si:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Vandè pa janm voye pwodwi a (dans 5 jou ouvrab)</li>
          <li>Pwodwi ou resevwa a pa konfòm ak deskripsyon an (foto, tèks)</li>
          <li>Pwodwi a rive kraze oswa domaje</li>
          <li>Ou pa janm resevwa livrezon an epi vandè pa ka pwouve livrezon an</li>
        </ul>
        <p className="mt-2">Peryòd revendikasyon: <strong>3 jou apre resevwa livrezon</strong> (oswa dat espere livrezon si ou pa resevwa li).</p>
      </>
    ),
  },
  {
    id: "how-to-request",
    title: "Kijan pou mande ranbousman",
    content: (
      <ol className="list-decimal pl-4 space-y-1.5">
        <li>Ale nan <strong>Kòmann mwen → Detay kòmann</strong></li>
        <li>Klike sou <strong>"Ouvri yon dispit"</strong></li>
        <li>Chwazi rezon an epi pibliye prèv (foto, screenshot)</li>
        <li>Ekip nou an pral revize nan 48 è</li>
        <li>Si valid, ranbousman an fèt nan 5–7 jou ouvrab</li>
      </ol>
    ),
  },
  {
    id: "non-refundable",
    title: "Sa ki pa ranbousab",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Chanjman lide apre livrezon konfime</li>
        <li>Atik ki deskripsyon an te klè sou eta yo (itilize, dezyèm men)</li>
        <li>Frè sèvis FLEXA MARKET (frè platfòm)</li>
        <li>Balans pwomos (promo credits)</li>
        <li>Kòmann dijital oswa sèvis deja founi</li>
      </ul>
    ),
  },
  {
    id: "timeline",
    title: "Delè ranbousman",
    content: (
      <div className="not-prose space-y-2">
        {[
          ["Kont FLEXA MARKET (pòtfèy)", "Imedyat (0–24 è)"],
          ["MonCash", "1–3 jou ouvrab"],
          ["Virement bancaire", "3–7 jou ouvrab"],
          ["Stripe / Kat kredi", "5–10 jou ouvrab"],
        ].map(([method, time]) => (
          <div key={method} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 text-sm">
            <span className="text-foreground">{method}</span>
            <span className="font-semibold text-primary">{time}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "disputes",
    title: "Pwosesis dispit",
    content: (
      <p>Si ou ak vandè a pa ka rive nan yon akò, FLEXA MARKET pral entèvni kòm meyatè. Desizyon final nou an obligatwa epi baze sou prèv toulède bò a founi.</p>
    ),
  },
];

export default function RefundPolicy() {
  return (
    <LegalLayout
      icon={<RefreshCw className="h-6 w-6" />}
      badge="Ranbousman"
      title="Règ Ranbousman"
      subtitle="Nou pwoteje peman ou jiskaske ou satisfè ak achte ou a."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
