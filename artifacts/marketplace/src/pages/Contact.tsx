import { useState } from "react";
import LegalLayout, { type LegalSection } from "@/components/LegalLayout";
import { Mail, MessageCircle, Clock, HelpCircle, Shield } from "lucide-react";

const ContactCard = ({ icon: Icon, title, desc, action, href }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; desc: string; action: string; href: string;
}) => (
  <a href={href} className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group">
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary/20 transition-colors">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="font-semibold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      <p className="text-xs text-primary font-semibold mt-2">{action} →</p>
    </div>
  </a>
);

const sections: LegalSection[] = [
  {
    id: "support-options",
    title: "Opsyon sipò yo",
    content: (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose">
        <ContactCard icon={Mail} title="Email sipò" desc="Reponn nan 24-48 è ouvrab" action="Ekri nou" href="mailto:support@flexamarket.com" />
        <ContactCard icon={MessageCircle} title="Chat an dirèk" desc="Disponib sou aplikasyon an" action="Ouvri chat" href="/support" />
        <ContactCard icon={HelpCircle} title="Sant Èd" desc="Atik, gid, ak FAQ" action="Wè atik" href="/help-center" />
        <ContactCard icon={Shield} title="Rapòte abi" desc="Signale yon pwoblèm sekirite" action="Rapòte" href="/report-abuse" />
      </div>
    ),
  },
  {
    id: "hours",
    title: "Orè sipò",
    content: (
      <div className="not-prose space-y-2">
        {[
          ["Lendi – Vandredi", "8h – 20h (EST)"],
          ["Samdi", "9h – 17h (EST)"],
          ["Dimanch", "Ijans sèlman"],
        ].map(([day, hours]) => (
          <div key={day} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{day}</span></div>
            <span className="text-sm font-semibold text-primary">{hours}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "buyer-support",
    title: "Sipò pou aketè",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Pwoblèm ak yon kòmann oswa livrezon</li>
        <li>Ranbousman ak retou</li>
        <li>Pwoblèm peman</li>
        <li>Vòl oswa atik ki pa konfòm ak deskripsyon</li>
        <li>Pwoblèm kont</li>
      </ul>
    ),
  },
  {
    id: "seller-support",
    title: "Sipò pou vandè",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Verifikasyon kont vandè</li>
        <li>Retrè lajan (peman MonCash / virement)</li>
        <li>Abonnman (Basic, Standard, Premium, VIP)</li>
        <li>Boost ak pwomosyon</li>
        <li>Signale yon aketè fwodè</li>
      </ul>
    ),
  },
  {
    id: "safety-support",
    title: "Sipò ijans sekirite",
    content: (
      <>
        <p>Si ou kwè kont ou yo konpwomèt oswa ou wè konpòtman ilegal sou platfòm nan, kontakte nou imedyatman:</p>
        <p><strong>Email sekirite:</strong> security@flexamarket.com</p>
        <p>Nou pran tout rapò sekirite serye epi nou reponn nan 4 è ouvrab.</p>
      </>
    ),
  },
];

export default function Contact() {
  return (
    <LegalLayout
      icon={<Mail className="h-6 w-6" />}
      badge="Kontakte nou"
      title="Sipò & Kontakt"
      subtitle="Nou la pou ede w. Chwazi opsyon ki pi bon pou ou."
      lastUpdated="Disponib 7 jou sou 7"
      sections={sections}
    />
  );
}
