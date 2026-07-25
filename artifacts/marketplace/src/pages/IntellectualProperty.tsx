import LegalLayout from "@/components/LegalLayout";
import { Copyright } from "lucide-react";

const sections = [
  {
    id: "our-ip",
    title: "Pwopriyete entèlektyèl FLEXA MARKET",
    content: (
      <>
        <p>Tout eleman vizyèl, teknolojik, ak kontni ke FLEXA MARKET kreye — logo, design, kòd sous, algorit, dokiman — se pwopriyete eksklizif FLEXA MARKET INC. Ou pa ka:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Kopye oswa repwoduire logo oswa design nou san pèmisyon ekri</li>
          <li>Dezasanble oswa fè enjenyeri envèsyon sou kòd nou</li>
          <li>Kreye pwodwi ki derive sou platfòm nou san otorizasyon</li>
          <li>Itilize non "FLEXA MARKET" pou reklam ou san pèmisyon</li>
        </ul>
      </>
    ),
  },
  {
    id: "user-content",
    title: "Kontni itilizatè yo",
    content: (
      <>
        <p>Ou posede dwa sou tout kontni ou kreye ak pibliye sou FLEXA MARKET (foto, deskripsyon, videyo, etc.). Lè ou pibliye kontni sou platfòm nan, ou ban nou:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Yon lisans non-eksklizif, mondyal, gratis pou afiche kontni ou a</li>
          <li>Dwa pou sèvi ak kontni ou a pou pwomote platfòm nan (promo, reklam)</li>
          <li>Dwa pou modifye oswa redimansyone kontni ou pou raisons teknik</li>
        </ul>
        <p className="mt-2">Lisans sa a pran fin lè ou efase kontni ou a oswa ou efase kont ou.</p>
      </>
    ),
  },
  {
    id: "dmca",
    title: "DMCA & dwa d'auteur",
    content: (
      <>
        <p>Si ou kwè yon kontni sou FLEXA MARKET vyole dwa d'auteur ou, voye yon notifikasyon DMCA nan:</p>
        <p><strong>Email:</strong> legal@flexamarket.com</p>
        <p>Notifikasyon ou dwe gen:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Idantifikasyon travay ki gen kopi a</li>
          <li>Lyen oswa deskripsyon kontni ki vyolan an sou platfòm nou</li>
          <li>Enfòmasyon kontak ou (non, email, adrès)</li>
          <li>Siyati ou (elektwonik oswa fizik)</li>
        </ul>
        <p className="mt-2">Nou pral reponn nan 5 jou ouvrab epi retire kontni ki vyolan an si reklamasyon an valid.</p>
      </>
    ),
  },
  {
    id: "trademarks",
    title: "Mak komèsyal",
    content: (
      <>
        <p>"FLEXA MARKET", logo nou, ak tout mak komèsyal asosye yo se mak depozite. Vandè ki sèvi ak mak komèsyal tiyè sou platfòm nou (ex: "Telefòn Apple", "Nike shoes") dwe asire yo gen dwa vann pwodwi sa yo.</p>
        <p className="mt-2">Anons ki vyole dwa mak komèsyal yo retire san avis.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Kontakte ekip legal nou",
    content: (
      <>
        <p>Pou tout pwoblèm pwopriyete entèlektyèl:</p>
        <p><strong>Email:</strong> legal@flexamarket.com</p>
        <p><strong>Sijè:</strong> [IP Issue] — [Deskripsyon kout]</p>
      </>
    ),
  },
];

export default function IntellectualProperty() {
  return (
    <LegalLayout
      icon={<Copyright className="h-6 w-6" />}
      badge="Legal"
      title="Pwopriyete Entèlektyèl"
      subtitle="Dwa d'auteur, mak komèsyal, ak pwoteksyon kontni."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
