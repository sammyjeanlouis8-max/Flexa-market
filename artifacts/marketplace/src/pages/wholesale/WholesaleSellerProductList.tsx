import { Fragment } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/contexts/auth";
import { fetchWholesaleProducts, formatMoney } from "@/lib/wholesaleApi";

type View = "inventory" | "drafts" | "tiers";

function ProductList({ view }: { view: View }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const list = useInfiniteQuery({
    queryKey: ["wholesale-edit-list", user?.id, view],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchWholesaleProducts({
      mine: true, status: view === "drafts" ? "draft" : undefined, limit: 30, offset: pageParam,
    }),
    getNextPageParam: (last, _, offset) => last.length === 30 ? offset + last.length : undefined,
  });
  const products = list.data?.pages.flat() ?? [];
  return (
    <WholesaleShell title={t(`wholesale.${view}Title`)} subtitle={t(`wholesale.${view}Subtitle`)}>
      {list.isLoading && <p>{t("common.loading")}</p>}
      {list.isError && <p role="alert">{t("wholesale.failedLoad")}</p>}
      {list.isSuccess && !products.length && <p>{t("wholesale.sellerEmptyTitle")}</p>}
      {products.map((p) => (
        <Link key={p.id} className="mb-2 block rounded-xl border p-3" href={`/wholesale/seller/products/${p.id}/edit`}>
          <strong>{p.title}</strong>
          <p>{formatMoney(p.unitPrice, p.currency)} · {t("wholesale.stock")} {p.stockQuantity}</p>
          {view === "tiers" && p.tiers.map((tier) => (
            <Fragment key={tier.id}><span>{tier.minQuantity}–{tier.maxQuantity ?? "∞"} · {formatMoney(tier.unitPrice, p.currency)}</span><br /></Fragment>
          ))}
        </Link>
      ))}
      {list.hasNextPage && <button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t("wholesale.moreListings")}</button>}
    </WholesaleShell>
  );
}

export default function WholesaleSellerProductList({ view }: { view: View }) {
  return <WholesalePageGate requireAuth><ProductList view={view} /></WholesalePageGate>;
}
