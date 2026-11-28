import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  createBeautyPortfolioItem,
  deleteBeautyPortfolioItem,
  fetchMyBeautyBusiness,
  type BeautyPortfolioItem,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterPortfolio() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Portfolio">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<BeautyPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetchMyBeautyBusiness(id)
      .then((d) => setItems(d.portfolio ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function onAdd() {
    if (!imageUrl.trim()) return;
    setBusy(true);
    try {
      await createBeautyPortfolioItem(id, {
        mediaUrl: imageUrl.trim(),
        title: caption.trim(),
        status: "published",
      });
      setImageUrl("");
      setCaption("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(itemId: number) {
    await deleteBeautyPortfolioItem(id, itemId);
    load();
  }

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : items.length === 0 ? (
        <BeautyEmpty title={t("beauty.emptyPortfolioTitle")} body="" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-[hsl(350,25%,92%)]">
              <img src={item.mediaUrl || item.imageUrl || ""} alt={item.title || item.caption || ""} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                {t("beauty.delete")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-3">
        <p className="text-sm font-extrabold">{t("beauty.addPortfolio")}</p>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Image URL"
          className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
        />
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption"
          className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("beauty.save")}
        </button>
      </div>
    </div>
  );
}
