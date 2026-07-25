import LegalLayout from "@/components/LegalLayout";
import { Accessibility as A11yIcon } from "lucide-react";

const sections = [
  {
    id: "commitment",
    title: "Angajman pou aksesiblite",
    content: (
      <p>FLEXA MARKET angaje li pou asire platfòm nan aksesib pou tout moun, enkli moun ki gen andikap. Nou suiv prensip WCAG 2.1 (Web Content Accessibility Guidelines) nan tout devlopman nou.</p>
    ),
  },
  {
    id: "features",
    title: "Fonksyon aksesiblite",
    content: (
      <div className="not-prose space-y-2">
        {[
          { feat: "Kontrast koulay", desc: "Tout tèks respekte yon reyo kontrast minimòm 4.5:1 WCAG AA" },
          { feat: "Navigasyon klavi", desc: "Tout fonksyon aksesib san souri — klavi sèlman" },
          { feat: "Lectè ekran", desc: "Kompatib ARIA labels, roles, ak live regions" },
          { feat: "Tèks altènatif", desc: "Tout imaj gen yon tèks alt deskripsyon" },
          { feat: "Tèks grosè ajistab", desc: "Design ki adapte si ou chanje grosè tèks nan aparèy ou" },
          { feat: "Mód fènwa", desc: "Disponib pou rediksyon fatig vizyal" },
          { feat: "Sout animasyon", desc: "Respekte preferans prefers-reduced-motion" },
          { feat: "Kontni plizyè lang", desc: "Disponib an Kreyòl, Fransè, Anglè, Espayòl, Pòtigè" },
        ].map(({ feat, desc }) => (
          <div key={feat} className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-card">
            <span className="text-primary text-sm mt-0.5">✓</span>
            <div>
              <p className="font-semibold text-foreground text-sm">{feat}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "known-issues",
    title: "Pwoblèm konnu",
    content: (
      <>
        <p>Nou aktiyèlman travay pou amelyore:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Konpatibilite konplè NVDA ak VoiceOver pou sèten modal</li>
          <li>Navigasyon entègral klavi nan galri foto</li>
          <li>Deskripsyon videyo (captons otomatik — an devlopman)</li>
        </ul>
      </>
    ),
  },
  {
    id: "feedback",
    title: "Voye kòmantè aksesiblite",
    content: (
      <>
        <p>Si ou rankontre yon pwoblèm aksesiblite:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Ekri nou: <strong>accessibility@flexamarket.com</strong></li>
          <li>Dekri pwoblèm lan, paj la, ak tecnoloji asistif ou itilize</li>
          <li>Nou reponn nan 5 jou ouvrab epi nou pran tout rapò serye</li>
        </ul>
      </>
    ),
  },
  {
    id: "standards",
    title: "Estanda ak sètifikasyon",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>WCAG 2.1 Nivo AA (objetif)</li>
        <li>Section 508 (Etazini)</li>
        <li>EN 301 549 (Ewòp)</li>
        <li>Apple Human Interface Guidelines</li>
        <li>Android Accessibility Guidelines</li>
      </ul>
    ),
  },
];

export default function Accessibility() {
  return (
    <LegalLayout
      icon={<A11yIcon className="h-6 w-6" />}
      badge="Aksesiblite"
      title="Aksesiblite"
      subtitle="FLEXA MARKET disponib pou tout moun, enkli moun ki gen andikap."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
      contactEmail="accessibility@flexamarket.com"
    />
  );
}
