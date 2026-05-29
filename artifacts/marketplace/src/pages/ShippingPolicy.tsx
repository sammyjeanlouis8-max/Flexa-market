import LegalLayout from "@/components/LegalLayout";
import { Package } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "Sistèm livrezon FLEXA MARKET",
    content: (
      <p>FLEXA MARKET itilize yon sistèm escrow — fondman pa lib jiskaske aketè konfime li te resevwa pwodwi a. Nou sipòte de (2) fason livrezon: livrezon manyèl (Ayiti) ak livrezon pa transpòtè komèsyal (lòt peyi).</p>
    ),
  },
  {
    id: "haiti-delivery",
    title: "Livrezon Ayiti (chofè manyèl)",
    content: (
      <>
        <p>Pou kòmann nan Ayiti:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Vandè aranye livrezon ak yon chofè oswa kourye lokal</li>
          <li>Aketè ak vandè ka akò sou yon pwen rankontre</li>
          <li>Delè espere: <strong>1–5 jou ouvrab</strong> depann de zòn nan</li>
          <li>Frè livrezon negosye dirèkteman ant aketè ak vandè</li>
        </ul>
      </>
    ),
  },
  {
    id: "international-delivery",
    title: "Livrezon entènasyonal",
    content: (
      <>
        <p>Pou kòmann andeyò Ayiti (Florid, Kanada, Lafrans, etc.):</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Vandè itilize yon transpòtè komèsyal (UPS, FedEx, DHL, USPS, etc.)</li>
          <li>Vandè dwe founi nimewo swivi valid</li>
          <li>Delè: <strong>5–15 jou ouvrab</strong> depann de distans</li>
          <li>Frè douàn aketè responsab pou li</li>
        </ul>
      </>
    ),
  },
  {
    id: "tracking",
    title: "Swiv livrezon",
    content: (
      <ol className="list-decimal pl-4 space-y-1.5">
        <li>Vandè antre nimewo swivi nan sistèm lan (si transpòtè komèsyal)</li>
        <li>Aketè resevwa notifikasyon ak nimewo a</li>
        <li>Aketè swiv kòmann li sou sit transpòtè a</li>
        <li>Lè resevwa, aketè konfime livrezon — fon lib pou vandè</li>
      </ol>
    ),
  },
  {
    id: "auto-release",
    title: "Lib otomatik fon",
    content: (
      <>
        <p>Si aketè pa konfime nan:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li><strong>Ayiti:</strong> 3 jou apre dat espere livrezon → fon lib otomatikman</li>
          <li><strong>Entènasyonal:</strong> 7 jou apre dat espere livrezon → fon lib otomatikman</li>
        </ul>
        <p className="mt-2">Si ou pa resevwa pwodwi a, ouvri yon dispit <strong>avan</strong> dat lib otomatik la.</p>
      </>
    ),
  },
  {
    id: "issues",
    title: "Pwodwi pèdi oswa domaje",
    content: (
      <p>Si pwodwi a pèdi oswa rive domaje, ouvri yon dispit imedyatman nan seksyon <strong>Kòmann mwen</strong>. Founi foto prèv si disponib. Nou pral travay ak toulède pati pou rezoud pwoblèm nan.</p>
    ),
  },
];

export default function ShippingPolicy() {
  return (
    <LegalLayout
      icon={<Package className="h-6 w-6" />}
      badge="Livrezon"
      title="Règ Livrezon"
      subtitle="Tout enfòmasyon sou kijan pwodwi yo voye ak livrezon yo fèt."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
