import LegalLayout from "@/components/LegalLayout";
import { Trash2 } from "lucide-react";

const sections = [
  {
    id: "your-rights",
    title: "Dwa ou pou efase done ou",
    content: (
      <>
        <p>Konfòmeman ak RGPD (Règleman Jeneral sou Pwoteksyon Done), CCPA, ak règ entènasyonal pwotreksyon done yo, ou gen dwa pou mande efasman done pèsonèl ou yo.</p>
        <p>Sa a enkli done ki kolekte pa FLEXA MARKET dirèkteman oswa atravè tiyè tankou Google, Meta, Stripe.</p>
      </>
    ),
  },
  {
    id: "data-we-hold",
    title: "Done nou konsève",
    content: (
      <div className="not-prose space-y-2">
        {[
          { cat: "Enfòmasyon idantifikasyon", examples: "Non, email, telefòn, foto pwofil, dat nesans" },
          { cat: "Aktivite platfòm", examples: "Istwa achte/vann, mesaj, komantè, evalyasyon" },
          { cat: "Done teknik", examples: "Adrès IP, tip navigatè, aparèy, entèvalsyon" },
          { cat: "Done peman", examples: "Istwa tranzaksyon (pa nimewo kat — sa se Stripe ki sere l)" },
          { cat: "Done lokalizasyon", examples: "Peyi, vil (pa GPS reyèl si ou pa bay pèmisyon)" },
        ].map(({ cat, examples }) => (
          <div key={cat} className="p-3 rounded-xl border border-border bg-card">
            <p className="font-semibold text-foreground text-sm">{cat}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{examples}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "how-to-request",
    title: "Kijan pou mande efasman done",
    content: (
      <>
        <p><strong>Metòd 1: Dirèkteman nan aplikasyon an</strong></p>
        <ol className="list-decimal pl-4 space-y-1 mb-4">
          <li>Konekte nan kont ou</li>
          <li>Ale nan Paramèt → Sekirite</li>
          <li>Klike sou "Efase kont mwen"</li>
          <li>Suiv pwosesis la</li>
        </ol>
        <p><strong>Metòd 2: Via email</strong></p>
        <p>Ekri <strong>privacy@flexamarket.com</strong> ak:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Sijè: "Demann Efasman Done — [email kont ou]"</li>
          <li>Adrès email kont ou a</li>
          <li>Nimewo telefòn asosye (si ou sonje l)</li>
          <li>Kalite efasman: <em>total</em> oswa <em>pasyèl</em></li>
        </ul>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Delè traitement",
    content: (
      <div className="not-prose space-y-2">
        {[
          ["Konfirmasyon demann", "Imedyatman (email oto)"],
          ["Dezaktivasyon kont", "24 è apre konfirmasyon"],
          ["Efasman done pèsonèl", "30 jou maksimòm"],
          ["Done legal (tranzaksyon)", "Konsève 7 an (obligasyon legal)"],
        ].map(([step, time]) => (
          <div key={step} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 text-sm">
            <span className="text-foreground">{step}</span>
            <span className="font-bold text-primary">{time}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "meta-callback",
    title: "Callback efasman pou Meta/Facebook",
    content: (
      <>
        <p>Si ou te konekte FLEXA MARKET via Facebook Login epi ou efase done ou sou Facebook, ou ka mande efasman done ki soti nan konegizon sa a:</p>
        <p>URL Callback: <code className="bg-muted px-1 rounded text-xs">https://flexamarket.com/data-deletion</code></p>
        <p>Oswa ekri: <strong>privacy@flexamarket.com</strong></p>
      </>
    ),
  },
  {
    id: "limitations",
    title: "Limitasyon efasman",
    content: (
      <>
        <p>Sèten done pa ka efase akoz obligasyon legal:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Istwa tranzaksyon finansye (7 an — obligasyon fiskal)</li>
          <li>Done ki nesesè pou rezoud dispit aktif</li>
          <li>Rapport sekirite ak anti-fwod</li>
          <li>Done minimòm pou anpeche re-enskripsyon avèk yon kont entèdi</li>
        </ul>
      </>
    ),
  },
];

export default function DataDeletion() {
  return (
    <LegalLayout
      icon={<Trash2 className="h-6 w-6" />}
      badge="Done & Konfidansyalite"
      title="Efasman Done"
      subtitle="Dwa ou pou kontwole ak efase done pèsonèl ou yo."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
      contactEmail="privacy@flexamarket.com"
    />
  );
}
