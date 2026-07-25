import LegalLayout from "@/components/LegalLayout";
import { FileText } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "Apèsi règ kontni",
    content: (
      <p>Règ kontni sa yo aplikab pou tout sa ou pibliye sou FLEXA MARKET — anons, foto, videyo, komantè, mesaj, ak pwofil. Kontni ki vyole règ sa yo retire imedyatman.</p>
    ),
  },
  {
    id: "allowed",
    title: "Kontni otorize",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Foto reyèl pwodwi w ap vann</li>
        <li>Videyo pwomosyon pou pwodwi oswa biznis ou</li>
        <li>Deskripsyon egzak ak onèt</li>
        <li>Komantè respektye sou achte, vandè, ak pwodwi</li>
        <li>Foto pwofil apwopriye (foto pèsonèl oryant, logo biznis)</li>
        <li>Kontni piblisite si ou gen yon plan boost aktif</li>
      </ul>
    ),
  },
  {
    id: "prohibited-content",
    title: "Kontni entèdi",
    content: (
      <>
        <div className="not-prose space-y-3">
          {[
            { cat: "Kontni adult", items: ["Nitid seksyèl oswa sous-nitid", "Material pòn", "Kontni seksyèlman eksplisit menm si art"] },
            { cat: "Vyolans", items: ["Imaj oswa videyo vyolans extreme", "Kontni ki glorifye ak fè pwomosyon pou vyolans", "Mennas oswa intimidasyon dirèk"] },
            { cat: "Diskrimasyon & Hayn", items: ["Diskri kont ras, sèks, relijyon, oryantasyon seksyèl", "Lang hayn kont nenpòt gwoup", "Stereotip domajab"] },
            { cat: "Dezinfòmasyon", items: ["Fo nouvèl ki gen pwotansyèl pou fè mal", "Demand sante fo (remèd fanm, majik, etc.)", "Manti sou pwodwi yo"] },
          ].map(({ cat, items }) => (
            <div key={cat} className="p-3 rounded-xl border border-border bg-card">
              <p className="font-bold text-sm text-foreground mb-2">🚫 {cat}</p>
              <ul className="space-y-1">
                {items.map(item => <li key={item} className="text-xs text-muted-foreground">• {item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "ugc",
    title: "Kontni itilizatè (UGC)",
    content: (
      <>
        <p>Lè ou pibliye kontni sou FLEXA MARKET:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Ou ban nou lisans non-eksklizif pou afiche epi pwomote kontni ou a sou platfòm nan</li>
          <li>Ou deklare ou posede dwa pou kontni ou pibliye a</li>
          <li>Ou aksepte responsabilite pou kontni ou a</li>
          <li>Nou rezerve dwa pou retire nenpòt kontni san avis</li>
        </ul>
      </>
    ),
  },
  {
    id: "moderation",
    title: "Modewasyon",
    content: (
      <>
        <p>Nou itilize yon konbinezon:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li><strong>Sistèm otomatik</strong> — deteksyon AI pou kontni klèman vyolan</li>
          <li><strong>Rapò kominote</strong> — itilizatè kapab rapòte kontni sispèk</li>
          <li><strong>Revizyon manyèl</strong> — ekip modevasyon nou pou ka konplèks</li>
        </ul>
        <p className="mt-2">Nou vize reponn ak rapò yo nan 24 è.</p>
      </>
    ),
  },
  {
    id: "appeals",
    title: "Apèl desizyon modewasyon",
    content: (
      <p>Si kontni ou te retire pa erè, ou ka konteste desizyon an nan 30 jou. Ekri <strong>appeals@flexamarket.com</strong> ak ID anons lan ak eksplikasyon ou.</p>
    ),
  },
];

export default function ContentPolicy() {
  return (
    <LegalLayout
      icon={<FileText className="h-6 w-6" />}
      badge="Modewasyon"
      title="Règ Kontni"
      subtitle="Sa ki otorize ak sa ki entèdi sou platfòm nan."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
