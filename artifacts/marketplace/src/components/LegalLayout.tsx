import { type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ExternalLink } from "lucide-react";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalLayoutProps {
  icon: ReactNode;
  badge: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
  contactEmail?: string;
  backHref?: string;
}

export default function LegalLayout({
  icon,
  badge,
  title,
  subtitle,
  lastUpdated,
  sections,
  contactEmail = "support@flexamarket.com",
  backHref = "/",
}: LegalLayoutProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.12),transparent_60%)]" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 pt-8 pb-10">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Retounen
          </Link>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 text-primary text-2xl">
              {icon}
            </div>
            <div>
              <span className="inline-block bg-primary/20 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-2">
                {badge}
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">{title}</h1>
              <p className="text-white/60 text-sm mt-1">{subtitle}</p>
              <p className="text-white/35 text-xs mt-2">{lastUpdated}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 flex gap-8">
        {/* Sticky ToC — desktop only */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-6">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Kontni</p>
            <nav className="space-y-0.5">
              {sections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-all ${
                    activeId === s.id
                      ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <article className="flex-1 min-w-0 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary text-xs font-black">{i + 1}</span>
                </div>
                <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-3">
                {s.content}
              </div>
            </section>
          ))}

          {/* Contact strip */}
          <div className="mt-10 p-6 rounded-2xl bg-primary/5 border border-primary/15">
            <p className="font-semibold text-foreground mb-1">Ou gen kesyon?</p>
            <p className="text-sm text-muted-foreground mb-3">
              Ekip sipò nou disponib pou ede w.
            </p>
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center gap-1.5 text-primary text-sm font-semibold hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {contactEmail}
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
