import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyReviews,
  replyToBeautyReview,
  type BeautyReview,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterReviews() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Reviews">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<BeautyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyMap, setReplyMap] = useState<Record<number, string>>({});

  function load() {
    setLoading(true);
    fetchBeautyReviews(id)
      .then((d) => setReviews(d.reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function sendReply(reviewId: number) {
    const reply = replyMap[reviewId]?.trim();
    if (!reply) return;
    await replyToBeautyReview(reviewId, { reply });
    setReplyMap((m) => ({ ...m, [reviewId]: "" }));
    load();
  }

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : reviews.length === 0 ? (
        <BeautyEmpty title={t("beauty.emptyReviewsTitle")} body="" />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white p-3">
              <p className="inline-flex items-center gap-1 text-sm font-bold">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {r.overallRating}
              </p>
              {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
              {r.ownerReply ? (
                <p className="mt-2 rounded-lg bg-[hsl(350,35%,96%)] px-2 py-1.5 text-xs">{r.ownerReply}</p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={replyMap[r.id] || ""}
                    onChange={(e) => setReplyMap((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder={t("beauty.reply")}
                    className="min-w-0 flex-1 rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void sendReply(r.id)}
                    className="rounded-lg bg-[hsl(350,40%,95%)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(350,45%,35%)]"
                  >
                    {t("beauty.reply")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
