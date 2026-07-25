import LegalLayout from "@/components/LegalLayout";
import { ShieldCheck, Lock, Eye, AlertTriangle, Star, BadgeCheck } from "lucide-react";

const FeatureCard = ({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) => (
  <div className="not-prose flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="font-bold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
    </div>
  </div>
);

const sections = [
  {
    id: "our-commitment",
    title: "Angajman nou",
    content: (
      <p>FLEXA MARKET dedye a kreye yon platfòm kòmès ki san fwod, san eskwòk, epi kote tout moun ka achte ak vann ak konfyans. Nou investis nan teknoloji sekirite ak ekip ki travay sou pwoteksyon itilizatè a chak jou.</p>
    ),
  },
  {
    id: "security-features",
    title: "Fonksyon sekirite",
    content: (
      <div className="not-prose grid grid-cols-1 gap-3">
        <FeatureCard icon={Lock} title="Escrow entegre" desc="Lajan ou rète an sekirite jiskaske ou resevwa pwodwi a epi konfime li. Vandè pa janm jwenn lajan yo anvan livrezon konfime." />
        <FeatureCard icon={BadgeCheck} title="Verifikasyon itilizatè" desc="Tout kont yo verifye via OTP SMS ak email. Vandè aktif yo pase yon verifikasyon adisyonèl." />
        <FeatureCard icon={Eye} title="Siveyans anti-fwod" desc="Sistèm nou an trase aktivite sispèk, vit IP, ak empreint aparèy pou detekte fwod anvan li rive." />
        <FeatureCard icon={AlertTriangle} title="Risk scoring" desc="Chak kont gen yon nòt risk dinamik. Kont ki sispèk yo revize pa ekip modevasyon nou an." />
        <FeatureCard icon={Star} title="Sistèm evalyasyon" desc="Komantè reyèl sou vandè ak aketè yo ede kominote a idantifye moun fiab." />
        <FeatureCard icon={ShieldCheck} title="Chiffreman done" desc="Tout done sansib yo chifre an transmisyon (TLS 1.3) ak an repo (AES-256)." />
      </div>
    ),
  },
  {
    id: "verification-system",
    title: "Sistèm verifikasyon vandè",
    content: (
      <div className="not-prose space-y-2">
        {[
          { badge: "✅ Telefòn verifye", desc: "Nimewo telefòn konfime via OTP" },
          { badge: "✅ Email verifye", desc: "Adres email konfime" },
          { badge: "🏅 Vendè verifye", desc: "Vandè ki pase verifikasyon dokiman ak istwa bon" },
          { badge: "⭐ Top vendè", desc: "Vandè ak 50+ vant ak evalyasyon 4.5+" },
        ].map(({ badge, desc }) => (
          <div key={badge} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
            <span className="text-sm font-semibold text-foreground min-w-[160px]">{badge}</span>
            <span className="text-sm text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "dispute-resolution",
    title: "Rezolisyon dispit",
    content: (
      <>
        <p>Si gen yon pwoblèm ant aketè ak vandè, nou ofri:</p>
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>Medyasyon otomatik via sistèm dispit nou an (48–72 è)</li>
          <li>Revizyon manyèl pa ekip sipò nou (si nesesè)</li>
          <li>Desizyon final obligatwa baze sou prèv toulède bò yo</li>
          <li>Ranbousman oswa lib fon selon desizyon an</li>
        </ol>
      </>
    ),
  },
  {
    id: "data-protection",
    title: "Pwoteksyon done",
    content: (
      <>
        <p>Nou pwoteje done ou konfòmeman ak:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Règleman Jeneral sou Pwoteksyon Done (RGPD) — pou itilizatè Ewòp</li>
          <li>California Consumer Privacy Act (CCPA) — pou itilizatè Etazini</li>
          <li>Pwòp Règ Konfidansyalite FLEXA MARKET</li>
        </ul>
      </>
    ),
  },
  {
    id: "transparency",
    title: "Transparans",
    content: (
      <p>Nou pibliye rapò transparans chak trimès ki montre kantite rapò abuse nou te resevwa, aksyon nou te pran, ak amelyorasyon sistèm nou fè. Nou kwè transparans renfòse konfyans kominote a.</p>
    ),
  },
];

export default function TrustCenter() {
  return (
    <LegalLayout
      icon={<ShieldCheck className="h-6 w-6" />}
      badge="Sekirite & Konfyans"
      title="Sant Konfyans"
      subtitle="Kijan nou pwoteje kominote FLEXA MARKET la."
      lastUpdated="Dènye mizajou: Me 2026"
      sections={sections}
    />
  );
}
