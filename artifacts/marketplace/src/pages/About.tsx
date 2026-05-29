import LegalLayout from "@/components/LegalLayout";

const sections = [
  {
    id: "mission",
    title: "Misyon nou",
    content: (
      <>
        <p>FLEXA MARKET se yon platfòm achte-vann kominotè ki kreye pou moun ki nan Ayiti ak dyaspora a. Nou kwè nan pouvwa komès lokal, nan kominote, epi nan opòtinite ekonomik pou tout moun.</p>
        <p>Misyon nou se konekte vendè ak aketè yon fason ki an sekirite, rapid, epi senp — sou nenpòt telefòn, menm ak koneksyon entènèt ki fèb.</p>
      </>
    ),
  },
  {
    id: "story",
    title: "Istwa nou",
    content: (
      <>
        <p>FLEXA MARKET te fonde pou reponn ak yon bezwen reyèl: yon mache dijital ki reyèlman travay pou kominote ayisyen yo — lokal ak entènasyonal.</p>
        <p>Depi lanse li, nou kreye yon espas kote milye moun ka vann pwodwi, jwenn djòb, epi konekte ak aketè nan peyi yo ak nan tout mond lan.</p>
      </>
    ),
  },
  {
    id: "values",
    title: "Valè nou yo",
    content: (
      <ul className="list-disc pl-4 space-y-2">
        <li><strong>Konfyans</strong> — Nou verifye vandè ak aketè pou pwoteje kominote a.</li>
        <li><strong>Transparans</strong> — Nou klè sou frè, règ, ak pwosesis yo.</li>
        <li><strong>Sekirite</strong> — Nou pwoteje done ak tranzaksyon tout moun.</li>
        <li><strong>Kominote</strong> — Nou konstwi ansanm avèk itilizatè nou yo.</li>
        <li><strong>Aksesiblite</strong> — Platfòm nou disponib nan plizyè lang ak sou tout aparèy.</li>
      </ul>
    ),
  },
  {
    id: "team",
    title: "Ekip nou",
    content: (
      <p>Nou se yon ekip pasyone ki dedye bay amelyorasyon platfòm nan kontinyèlman. Nou travay ak kominote nou yo pou nou fè FLEXA MARKET pi bon chak jou.</p>
    ),
  },
  {
    id: "contact",
    title: "Kontakte nou",
    content: (
      <>
        <p>Pou nenpòt kesyon, sijesyon, oswa patenarya:</p>
        <p><strong>Email:</strong> support@flexamarket.com</p>
        <p><strong>Biwo:</strong> Pòtoprens · Miami · Montréal</p>
      </>
    ),
  },
];

export default function About() {
  return (
    <LegalLayout
      icon="🏪"
      badge="Sou nou"
      title="À Propos de FLEXA MARKET"
      subtitle="Platfòm kominotè achte-vann — kreye pou Ayiti ak dyaspora a."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
