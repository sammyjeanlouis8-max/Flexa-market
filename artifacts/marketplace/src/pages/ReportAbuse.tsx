import LegalLayout from "@/components/LegalLayout";
import { Flag, AlertTriangle, ShieldAlert } from "lucide-react";

const ReportCard = ({ emoji, title, desc, steps }: { emoji: string; title: string; desc: string; steps: string[] }) => (
  <div className="not-prose p-4 rounded-xl border border-border bg-card">
    <div className="flex items-start gap-2 mb-3">
      <span className="text-xl">{emoji}</span>
      <div>
        <p className="font-bold text-foreground text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
    <ol className="space-y-1">
      {steps.map((step, i) => <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="font-bold text-primary shrink-0">{i + 1}.</span>{step}</li>)}
    </ol>
  </div>
);

const sections = [
  {
    id: "intro",
    title: "Rapòte abi: kijan sa travay",
    content: (
      <p>FLEXA MARKET pran tout rapò abi serye. Ekip moderasyon nou travay 7 jou sou 7 pou revize rapò yo ak pran aksyon rapid. Rapò ou rete anonim — vendè a pa ka wè ki moun ki rapòte li.</p>
    ),
  },
  {
    id: "how-to-report",
    title: "Kijan pou rapòte sou platfòm nan",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <ReportCard emoji="🏷️" title="Rapòte yon anons" desc="Si ou wè yon pwodwi entèdi oswa misleading" steps={[
          "Ale nan paj anons lan",
          "Klike sou icon \"...\" oswa bouton \"Rapòte\"",
          "Chwazi kategori rapò a",
          "Ajoute detay epi voye",
        ]} />
        <ReportCard emoji="👤" title="Rapòte yon itilizatè" desc="Si yon moun ap arase ou oswa konpòte mal" steps={[
          "Ale nan pwofil itilizatè a",
          "Klike sou \"Rapòte itilizatè sa\"",
          "Chwazi rezon (harasèman, eskwòk, etc.)",
          "Voye rapò a",
        ]} />
        <ReportCard emoji="💬" title="Rapòte yon mesaj" desc="Si ou resevwa mesaj abizif oswa eskwòk" steps={[
          "Ouvri konvèsasyon an",
          "Kenbe mesaj la (long press) oswa klike sou \"...\"",
          "Chwazi \"Rapòte mesaj sa\"",
          "Voye rapò a",
        ]} />
      </div>
    ),
  },
  {
    id: "emergency",
    title: "Sitiyasyon ijans",
    content: (
      <div className="not-prose flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-red-600 dark:text-red-400 text-sm mb-1">Si ou an danje imedyat</p>
          <p className="text-sm text-muted-foreground">Rele ijans lokal anvan ou rapòte sou platfòm nan. Nan Ayiti: 114 (polis), 118 (pompye). Apre ou an sekirite, rapòte sou: <strong>safety@flexamarket.com</strong></p>
        </div>
      </div>
    ),
  },
  {
    id: "email-report",
    title: "Rapòte via email",
    content: (
      <>
        <p>Si ou pa ka rapòte dirèkteman sou platfòm nan, ekri nou:</p>
        <div className="not-prose space-y-2 mt-2">
          {[
            { label: "Abuse jeneral", email: "abuse@flexamarket.com" },
            { label: "Sekirite urgent", email: "safety@flexamarket.com" },
            { label: "Kontni ilegal (CSAM, etc.)", email: "legal@flexamarket.com" },
            { label: "Fwod ak eskwòk", email: "fraud@flexamarket.com" },
          ].map(({ label, email }) => (
            <div key={email} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0 text-sm">
              <span className="text-foreground">{label}</span>
              <a href={`mailto:${email}`} className="text-primary font-medium hover:underline">{email}</a>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "what-happens",
    title: "Sa ki pase apre rapò ou a",
    content: (
      <ol className="list-decimal pl-4 space-y-1.5">
        <li>Sistèm nou konfime resepsyon rapò ou a imedyatman</li>
        <li>Ekip moderasyon revize nan 24–48 è (4 è pou ka sekirite)</li>
        <li>Aksyon pran: avetisman, retirasyon kontni, oswa sispansyon kont</li>
        <li>Ou ka resevwa yon mise à jour sou eta rapò ou a</li>
      </ol>
    ),
  },
  {
    id: "false-reports",
    title: "Rapò fo",
    content: (
      <p>Rapò ki fèt avèk move entansyon (pou nwi yon moun san rezon valid) pral mennen nan sanksyon. Sistèm nou detekte rapò repetitif ki pa fondèman ak li bloke yo.</p>
    ),
  },
];

export default function ReportAbuse() {
  return (
    <LegalLayout
      icon={<Flag className="h-6 w-6" />}
      badge="Sekirite"
      title="Rapòte Abi"
      subtitle="Ede nou kenbe FLEXA MARKET an sekirite pou tout moun."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
