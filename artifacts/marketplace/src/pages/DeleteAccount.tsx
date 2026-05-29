import LegalLayout from "@/components/LegalLayout";
import { Trash2, AlertTriangle, ShieldCheck, Clock } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "Apèsi jeneral",
    content: (
      <>
        <p>Ou gen dwa pou efase kont ou nenpòt ki lè. Dokiman sa eksplike ki done ki efase, ki sa ki konsève, ak kijan pou fè demann lan.</p>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 not-prose mt-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-400"><strong>Atansyon:</strong> Efasman kont se aksyon pèmanan. Ou pa ka rekipere done yo aprè 30 jou.</p>
        </div>
      </>
    ),
  },
  {
    id: "how-to-delete",
    title: "Kijan pou efase kont ou",
    content: (
      <ol className="list-decimal pl-4 space-y-2">
        <li>Konekte nan kont ou sou FLEXA MARKET</li>
        <li>Ale nan <strong>Paramèt → Sekirite</strong></li>
        <li>Klike sou <strong>"Efase kont mwen"</strong></li>
        <li>Antre modpas ou pou konfime</li>
        <li>Klike sou <strong>"Konfime efasman"</strong></li>
        <li>Ou pral resevwa yon email konfirmasyon</li>
      </ol>
    ),
  },
  {
    id: "alternative",
    title: "Altènativ: kontakte sipò",
    content: (
      <>
        <p>Si ou pa ka konekte nan kont ou, oswa ou gen pwoblèm teknik, ekri nou:</p>
        <p><strong>Email:</strong> support@flexamarket.com</p>
        <p>Mete sijè: <em>"Demann efasman kont"</em> epi bay:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Non ou (non ak siyati)</li>
          <li>Adres email ou sèvi pou kreye kont lan</li>
          <li>Nimewo telefòn ki asosye ak kont lan (si disponib)</li>
        </ul>
      </>
    ),
  },
  {
    id: "what-gets-deleted",
    title: "Kisa ki efase",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Pwofil ou (non, foto, byografi)</li>
        <li>Tout anons ou pibliye</li>
        <li>Istwa konvèsasyon yo</li>
        <li>Preferans ak paramèt ou</li>
        <li>Notifikasyon yo</li>
        <li>Kont pwomos (balans pwomos pa ranbouse)</li>
      </ul>
    ),
  },
  {
    id: "what-is-kept",
    title: "Kisa ki konsève (pou rezon legal)",
    content: (
      <>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Istwa tranzaksyon pou 7 an (obligasyon fiskal)</li>
          <li>Rapò anti-fwod ak aktivite sekirite</li>
          <li>Done minimòm pou evite re-enskripsyon fraudilyèz</li>
        </ul>
        <p className="mt-3">Tout done yo efase konplètman aprè 30 jou. Pandan peryòd sa a, kont ou dezaktive epi li pa ka wè pa lòt moun.</p>
      </>
    ),
  },
  {
    id: "seller-considerations",
    title: "Konsiderasyon pou vandè",
    content: (
      <>
        <p>Si ou se yon vandè aktif, <strong>anvan</strong> efase kont ou:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Asire tout kòmann yo liv oswa anile</li>
          <li>Retire balans ou nan pòtfèy ou</li>
          <li>Anile abonnman vandè ou (si nesesè)</li>
          <li>Fèmen tout dispit ouvè</li>
        </ul>
        <p className="mt-2">Nou p ap ka ranbouse balans ki rete aprè efasman kont lan.</p>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Delè efasman",
    content: (
      <div className="not-prose space-y-3">
        {[
          { icon: Clock, label: "Imedyatman", desc: "Kont dezaktive, pèsonn pa ka wè ou" },
          { icon: Clock, label: "7 jou", desc: "Anons yo retire nan rechèch" },
          { icon: Clock, label: "30 jou", desc: "Efasman konplè tout done pèsonèl yo" },
          { icon: ShieldCheck, label: "7 an", desc: "Istwa tranzaksyon konsève (legal)" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export default function DeleteAccount() {
  return (
    <LegalLayout
      icon={<Trash2 className="h-6 w-6" />}
      badge="Jere kont"
      title="Efase Kont Ou"
      subtitle="Nou respekte dwa ou pou kontwole done pèsonèl ou yo."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
