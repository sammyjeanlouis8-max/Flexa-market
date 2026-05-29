import LegalLayout from "@/components/LegalLayout";
import { Store } from "lucide-react";

const sections = [
  {
    id: "eligibility",
    title: "Elijibilite vandè",
    content: (
      <>
        <p>Pou vann sou FLEXA MARKET, ou dwe:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Gen omwen 18 an</li>
          <li>Gen yon kont verifye (telefòn + email)</li>
          <li>Aksepte règ ak kondisyon sèvis nou yo</li>
          <li>Respekte lwa kòmès ki aplikab nan peyi ou a</li>
        </ul>
      </>
    ),
  },
  {
    id: "listing-rules",
    title: "Règ pou anons",
    content: (
      <>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Foto yo dwe reyèl — foto stock entèdi</li>
          <li>Prix la dwe klè epi an dola ameriken (USD)</li>
          <li>Deskripsyon dwe egzak — eta pwodwi a (nèf, bon kondisyon, defektif)</li>
          <li>Tout pwodwi dwe legal nan peyi ou a</li>
          <li>Yon sèl anons pou chak pwodwi — doublons entèdi</li>
        </ul>
      </>
    ),
  },
  {
    id: "fees",
    title: "Frè ak komisyon",
    content: (
      <div className="not-prose space-y-2">
        {[
          ["Kreye yon anons (Basic)", "Gratis"],
          ["Komisyon sou vant", "0% – 10% (depann de plan)"],
          ["Boost pwodwi", "À partir de $5"],
          ["Abonnman Standard", "$9.99/mwa"],
          ["Abonnman Premium", "$19.99/mwa"],
          ["Abonnman VIP", "$49.99/mwa"],
        ].map(([item, price]) => (
          <div key={item} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 text-sm">
            <span className="text-foreground">{item}</span>
            <span className="font-bold text-primary">{price}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "payments",
    title: "Peman ak retrè",
    content: (
      <>
        <p>Lè yon vant konfime, lajan an krete sou kont FLEXA MARKET ou. Ou ka retire via:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li><strong>MonCash</strong> — imedyat, verifye avan premye retrè</li>
          <li><strong>Virement bancaire</strong> — 3–7 jou ouvrab</li>
          <li><strong>Kat FM (pòtfèy dijital)</strong> — disponib si admin aktive l</li>
        </ul>
        <p className="mt-2">Ou dwe verifye metòd peman ou avan premye retrè. Admin FLEXA MARKET revize epi apwouve kont peman yo.</p>
      </>
    ),
  },
  {
    id: "responsibilities",
    title: "Responsabilite vandè",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Voye kòmann yo nan 5 jou ouvrab apre peman konfime</li>
        <li>Founi yon nimewo swivi livrezon ki valab</li>
        <li>Reponn mesaj aketè yo nan 24 è</li>
        <li>Anonse si yon pwodwi pa disponib ankò</li>
        <li>Respekte tout règ kominotè yo</li>
      </ul>
    ),
  },
  {
    id: "violations",
    title: "Vyolasyon ak sank̂syon",
    content: (
      <p>Vandè ki vyole règ yo riske: retirasyon anons, sispansyon kont, konfiskayon balans (nan ka fwod), ak referans bay otorite legal yo. FLEXA MARKET rezerv dwa li pou fèmen nenpòt kont san avis si li detekte konpòtman fwodilèz.</p>
    ),
  },
];

export default function SellerPolicy() {
  return (
    <LegalLayout
      icon={<Store className="h-6 w-6" />}
      badge="Vandè"
      title="Règleman pou Vandè"
      subtitle="Tout sa ou bezwen konnen pou vann sou FLEXA MARKET."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
