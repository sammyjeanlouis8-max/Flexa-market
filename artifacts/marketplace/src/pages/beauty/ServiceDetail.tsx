import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyService,
  formatBeautyPrice,
  type BeautyBusiness,
  type BeautyProfessional,
  type BeautyService,
} from "@/lib/beautyApi";

export default function BeautyServiceDetail() {
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
  const [service, setService] = useState<BeautyService | null>(null);
  const [business, setBusiness] = useState<BeautyBusiness | null>(null);
  const [professionals, setProfessionals] = useState<BeautyProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    fetchBeautyService(id)
      .then((data) => {
        if (cancelled) return;
        setService(data.service);
        setBusiness(data.business);
        setProfessionals(data.professionals);
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
  if (error || !service || !business) {
    return <BeautyEmpty title={t("beauty.loadError")} body={t("beauty.emptyBody")} />;
  }

  const locationLabel =
    service.serviceLocation === "at_customer"
      ? t("beauty.atCustomer")
      : service.serviceLocation === "both"
        ? t("beauty.bothLocations")
        : t("beauty.atBusiness");

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[hsl(350,20%,88%)] bg-white">
        {service.imageUrl && (
          <img src={service.imageUrl} alt="" className="h-44 w-full object-cover" />
        )}
        <div className="p-4">
          <h1 className="text-xl font-extrabold tracking-tight">{service.name}</h1>
          <Link href={`/beauty/${business.id}`} className="mt-1 text-xs font-semibold text-[hsl(350,45%,40%)]">
            {business.name}
          </Link>
          <p className="mt-2 text-2xl font-black text-[hsl(350,45%,35%)]">
            {formatBeautyPrice(service.price, service.currency)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("beauty.durationMin", { min: service.durationMinutes })} · {locationLabel}
          </p>
          {service.description && (
            <p className="mt-3 text-sm leading-relaxed text-[hsl(350,15%,30%)]">{service.description}</p>
          )}
          {service.preparationInstructions && (
            <p className="mt-2 rounded-lg bg-[hsl(350,35%,96%)] px-3 py-2 text-xs text-[hsl(350,30%,30%)]">
              {service.preparationInstructions}
            </p>
          )}
        </div>
      </div>

      {professionals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-extrabold">{t("beauty.professionals")}</h2>
          {professionals.map((p) => (
            <Link
              key={p.id}
              href={`/beauty/pro/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3"
            >
              <div className="h-10 w-10 overflow-hidden rounded-full bg-[hsl(350,30%,94%)]">
                {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <p className="text-sm font-bold">{p.fullName}</p>
                <p className="text-xs text-muted-foreground">{p.role}</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      <Link
        href={`/beauty/book/${business.id}?serviceId=${service.id}`}
        className="flex w-full items-center justify-center rounded-2xl bg-[hsl(350,45%,38%)] py-3.5 text-sm font-extrabold text-white"
      >
        {t("beauty.bookNow")}
      </Link>
    </div>
  );
}
