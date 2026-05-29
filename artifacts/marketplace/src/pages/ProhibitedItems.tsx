import LegalLayout from "@/components/LegalLayout";
import { Ban } from "lucide-react";

const ProhibitedBlock = ({ emoji, title, items }: { emoji: string; title: string; items: string[] }) => (
  <div className="not-prose p-4 rounded-xl border border-red-500/20 bg-red-500/5">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{emoji}</span>
      <span className="font-bold text-foreground text-sm">{title}</span>
    </div>
    <ul className="space-y-1">
      {items.map(item => (
        <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Ban className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  </div>
);

const sections = [
  {
    id: "intro",
    title: "Pwodwi entèdi",
    content: (
      <>
        <p>Pou pwoteje kominote nou an ak pou respekte lalwa, sèten pwodwi entèdi sou FLEXA MARKET. Nenpòt anons ki vyole règ sa yo pral retire imedyatman, epi kont lan pral pini.</p>
        <p>Si ou pa sèten si yon pwodwi otorize, kontakte nou avan ou pibliye li.</p>
      </>
    ),
  },
  {
    id: "weapons",
    title: "Zam ak eksplosif",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <ProhibitedBlock emoji="🔫" title="Zam" items={[
          "Zam pou tou de men (revòlvè, pistolet)",
          "Zam otomatik ak semi-otomatik",
          "Minisyon ak poud tirap",
          "Silansyatè ak akseswa modifikasyon ilegal",
          "Bòm, grenad, ak eksplosif nenpòt kalite",
          "Zam bio-chimik",
        ]} />
      </div>
    ),
  },
  {
    id: "drugs",
    title: "Dwòg ak sibstans ilegal",
    content: (
      <div className="not-prose">
        <ProhibitedBlock emoji="💊" title="Sibstans" items={[
          "Dwòg ilegal (kokayin, erewòn, kristal met, etc.)",
          "Medikaman sou òdonans san preskripsyon",
          "Pwodwi pou fabrike dwòg",
          "Sibstans psychoaktif legal (designer drugs)",
          "Alkòl ki fabrike ilegalman",
          "Tabak ak sigaret nan sèten jiridiksyon",
        ]} />
      </div>
    ),
  },
  {
    id: "illegal-services",
    title: "Sèvis ilegal",
    content: (
      <div className="not-prose">
        <ProhibitedBlock emoji="⚠️" title="Sèvis" items={[
          "Pirataй (hacking) ak sèvis akèz ilegal",
          "Fò dokiman (visa, paspò, lisans)",
          "Sèvis eskwòk oswa wanga (si pwomèt rezilta garant)",
          "Blanchiman lajan",
          "Trafik imen oswa travay fòse",
          "Pwostitsyon ak sèvis seksyèl",
        ]} />
      </div>
    ),
  },
  {
    id: "counterfeit",
    title: "Pwodwi kont8efè ak vòlè",
    content: (
      <div className="not-prose">
        <ProhibitedBlock emoji="🏷️" title="Imitasyon" items={[
          "Pwodwi ki imite mak komèsyal (Gucci, iPhone, Nike fake, etc.)",
          "Lajan fos oswa deviz ki imitasyon",
          "Bilye konpetisyon, konsè, ak evènman fos",
          "Atik ki rapòte vòlè",
          "Logisyèl pirate oswa lisans ilegal",
          "Sètifika edikasyon oswa diplòm fos",
        ]} />
      </div>
    ),
  },
  {
    id: "exploitation",
    title: "Eksplwatasyon ak kontni ilegal",
    content: (
      <div className="not-prose">
        <ProhibitedBlock emoji="🚫" title="Kontni" items={[
          "Tout kontni ki eksplwate timoun (CSAM) — ZERO TOLERANS",
          "Material pòn san konsantman",
          "Kontni ki ankouraje jousiw nan vyolans",
          "Pwodwi imen (ògan, san, etc.)",
          "Espès bèt an danje oswa pati yo",
          "Rès imen",
        ]} />
      </div>
    ),
  },
  {
    id: "dangerous",
    title: "Pwodwi danjere",
    content: (
      <div className="not-prose">
        <ProhibitedBlock emoji="☣️" title="Materyèl danjere" items={[
          "Pwodwi chimik tokzik",
          "Pwodwi radyoaktif",
          "Pyrotechnie ilegal",
          "Gas konprime san reglèman",
          "Pwodwi medikal ki retire sou mache a",
        ]} />
      </div>
    ),
  },
  {
    id: "report",
    title: "Rapòte yon anons entèdi",
    content: (
      <>
        <p>Si ou wè yon anons ki se yon pwodwi entèdi:</p>
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>Klike sou <strong>"Rapòte"</strong> nan paj anons lan</li>
          <li>Chwazi <strong>"Pwodwi entèdi oswa ilegal"</strong></li>
          <li>Ajoute detay adisyonèl si ou gen yo</li>
        </ol>
        <p className="mt-2">Ou ka tou ekri: <strong>safety@flexamarket.com</strong></p>
      </>
    ),
  },
];

export default function ProhibitedItems() {
  return (
    <LegalLayout
      icon={<Ban className="h-6 w-6" />}
      badge="Règ"
      title="Pwodwi Entèdi"
      subtitle="Pwodwi ak sèvis ki pa otorize sou FLEXA MARKET."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
