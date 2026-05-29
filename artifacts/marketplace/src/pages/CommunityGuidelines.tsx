import LegalLayout from "@/components/LegalLayout";
import { Users, ShieldCheck, AlertTriangle, Heart } from "lucide-react";

const RuleBlock = ({ emoji, title, items }: { emoji: string; title: string; items: string[] }) => (
  <div className="not-prose p-4 rounded-xl border border-border bg-card">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{emoji}</span>
      <span className="font-bold text-foreground text-sm">{title}</span>
    </div>
    <ul className="space-y-1.5">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="text-red-500 mt-0.5 shrink-0">✗</span>
          {item}
        </li>
      ))}
    </ul>
  </div>
);

const sections = [
  {
    id: "intro",
    title: "Entwodiksyon",
    content: (
      <p>FLEXA MARKET se yon espas kominotè. Règ sa yo egziste pou pwoteje tout moun — aketè, vandè, ak vwazen. Vyolasyon règ sa yo ka mennen nan avetisман, sispansyon, oswa entèdiksyon pèmanan.</p>
    ),
  },
  {
    id: "prohibited-behavior",
    title: "Konpòtman entèdi",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <RuleBlock emoji="🚫" title="Fwod ak Eskwòk" items={[
          "Vann pwodwi ou pa gen yo",
          "Prezante pwodwi fos oswa kontrefè",
          "Fè peman ki pa valab",
          "Itilize kont fos pou manipile mache a",
          "Fè escroc sou platfòm nan (avance-pèt, bòdwo fos, etc.)",
        ]} />
        <RuleBlock emoji="⚠️" title="Kontni Entèdi" items={[
          "Foto oswa videyo adult, pòn, oswa seksyèlman eksplisit",
          "Kontni ki ankouraje vyolans kont moun oswa gwoup",
          "Diskrimasyon rasyal, seksyèl, relijyèz oswa etnik",
          "Pwopagann tèroris oswa ekstremis",
          "Kontni ki eksplwate timoun (CSAM)",
        ]} />
        <RuleBlock emoji="💬" title="Konpòtman Abizif" items={[
          "Arasман, ensilt, mennas kont nenpòt moun",
          "Spam — mesaj repete oswa non-solicité",
          "Itilize sistèm mesaj la pou fè reklam pa otorize",
          "Kreyasyon kont miltip pou kontourne entèdiksyon",
          "Impe̞ zonasyon lòt moun",
        ]} />
        <RuleBlock emoji="🏷️" title="Anons Fos" items={[
          "Anons pwodwi vòlè oswa ilegal",
          "Deskripsyon twonpè sou kalite oswa eta pwodwi",
          "Prix manipile pou twonpe aketè",
          "Foto ki pa reprezante pwodwi reyèl la",
        ]} />
      </div>
    ),
  },
  {
    id: "consequences",
    title: "Konsekans",
    content: (
      <div className="not-prose space-y-3">
        {[
          { level: "1", color: "border-yellow-500/30 bg-yellow-500/5", label: "Avetisман", desc: "Premye vyolasyon minè — notifikasyon + sipresyon kontni" },
          { level: "2", color: "border-orange-500/30 bg-orange-500/5", label: "Restriksyon temporè", desc: "Kont restrein pou 7–30 jou" },
          { level: "3", color: "border-red-500/30 bg-red-500/5", label: "Sispansyon pèmanan", desc: "Kont fèmen pou tout tan, fondsyon bloke" },
        ].map(({ level, color, label, desc }) => (
          <div key={level} className={`flex items-start gap-3 p-4 rounded-xl border ${color}`}>
            <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 text-sm font-black">{level}</div>
            <div>
              <p className="font-bold text-foreground text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "reporting",
    title: "Kijan pou rapòte",
    content: (
      <>
        <p>Si ou wè yon kontni ki vyole règ sa yo:</p>
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>Klike sou bouton <strong>"Rapòte"</strong> ki bò atik la oswa pwofil vandè a</li>
          <li>Chwazi rezon rapò ou a</li>
          <li>Ekri detay adisyonèl si nesesè</li>
          <li>Voye rapò a — nou pral revize li nan 24–48 è</li>
        </ol>
        <p className="mt-2">Oubyen kontakte nou dirèkteman: <strong>safety@flexamarket.com</strong></p>
      </>
    ),
  },
  {
    id: "appeals",
    title: "Apèl",
    content: (
      <p>Si ou kwè desizyon nou te pran yo se yon erè, ou ka fè apèl nan 30 jou apre aksyon an. Kontakte nou sou <strong>appeals@flexamarket.com</strong> ak ID kont ou ak eksplikasyon ou.</p>
    ),
  },
];

export default function CommunityGuidelines() {
  return (
    <LegalLayout
      icon={<Users className="h-6 w-6" />}
      badge="Kominote"
      title="Règ Kominotè"
      subtitle="Règ yo ki pwoteje tout moun sou FLEXA MARKET."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
