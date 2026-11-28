import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyProfessional,
  formatBeautyPrice,
  type BeautyBusiness,
  type BeautyProfessional,
  type BeautyService,
} from "@/lib/beautyApi";

export default function BeautyProfessionalDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <BeautyPageGate>
      <BeautyShell>
        <Body id={Number(id)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [pro, setPro] = useState<BeautyProfessional | null>(null);
  const [business, setBusiness] = useState<BeautyBusiness | null>(null);
  const [services, setServices] = useState<BeautyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    fetchBeautyProfessional(id)
      .then((data) => {
        if (cancelled) return;
        setPro(data.professional);
        setBusiness(data.business);
        setServices(data.services);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (error || !pro || !business) {
    return <BeautyEmpty title={t("beauty.loadError")} body={t("beauty.emptyBody")} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4">
        <div className="h-20 w-20 overflow-hidden rounded-2xl bg-[hsl(350,30%,94%)]">
          {pro.photoUrl ? <img src={pro.photoUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight">{pro.fullName}</h1>
          <p className="text-sm text-muted-foreground">{pro.role}</p>
          {(pro.avgRating > 0 || pro.ratingCount > 0) && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {pro.avgRating.toFixed(1)} ({pro.ratingCount})
            </p>
          )}
          <Link href={`/beauty/${business.id}`} className="mt-1 block text-xs font-semibold text-[hsl(350,45%,40%)]">
            {business.name}
          </Link>
        </div>
      </div>

      {pro.biography && (
        <p className="text-sm leading-relaxed text-[hsl(350,15%,30%)]">{pro.biography}</p>
      )}

      {(pro.specializations?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pro.specializations!.map((s) => (
            <span key={s} className="rounded-md bg-[hsl(350,35%,95%)] px-2 py-1 text-[11px] font-semibold text-[hsl(350,40%,35%)]">
              {s}
            </span>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold">{t("beauty.services")}</h2>
        {services.length === 0 ? (
          <BeautyEmpty title={t("beauty.emptyServicesTitle")} body="" />
        ) : (
          services.map((s) => (
            <Link
              key={s.id}
              href={`/beauty/book/${business.id}?serviceId=${s.id}&professionalId=${pro.id}`}
              className="flex items-center justify-between rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3"
            >
              <div>
                <p className="text-sm font-bold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("beauty.durationMin", { min: s.durationMinutes })}
                </p>
              </div>
              <span className="text-sm font-extrabold text-[hsl(350,45%,35%)]">
                {formatBeautyPrice(s.price, s.currency)}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
