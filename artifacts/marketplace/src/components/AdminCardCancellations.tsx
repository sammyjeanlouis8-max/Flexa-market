import { useQuery } from "@tanstack/react-query";
import { listCardCancellations } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";

export default function AdminCardCancellations() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const query = useQuery({
    queryKey: ["admin-card-cancellations", user?.id], enabled: !!token, refetchInterval: 15000,
    queryFn: ({ signal }) => listCardCancellations({ signal, headers: { Authorization: `Bearer ${token}` } }),
  });
  return <section className="rounded-2xl border p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">Anilasyon Stripe anvan ekspedisyon</h2>
      <Button size="sm" variant="outline" onClick={() => query.refetch()}>Aktyalize</Button>
    </div>
    <p className="text-xs text-muted-foreground">Ranbousman dwe retounen sou kat orijinal la. Sèvi ak kontwòl Stripe ki egziste deja; gwo montan yo toujou mande dezyèm apwobasyon.</p>
    {query.isLoading && <p>Ap chaje…</p>}
    {query.isError && <p role="alert" className="text-red-600">Lis demann yo pa disponib.</p>}
    {query.data?.length === 0 && <p className="text-sm">Pa gen demann nan zòn ou.</p>}
    {query.data?.map(r => <article key={r.id} className="rounded-xl border p-4 space-y-2 text-sm">
      <h3 className="font-bold">Kòmand #{r.orderId} — {r.title}</h3>
      <p>{Number(r.amount).toFixed(2)} {r.currency} · {({ requested: "Tann admin", processing: "Stripe poko konfime",
        approval_required: "Tann dezyèm apwobasyon", needs_review: "Bezwen rekonsilyasyon", refunded: "Ranbouse sou kat" } as Record<string, string>)[r.status] ?? r.status}</p>
      {r.status !== "refunded" && (user as any)?.role === "superadmin" && <Button size="sm" variant="outline"
        onClick={() => navigate(`/admin/stripe-transactions?transactionId=${r.orderId}`)}>Verifye / ranbouse kat</Button>}
      {r.status !== "refunded" && (user as any)?.role !== "superadmin" && <p className="text-xs">Yon Super Admin dwe trete ranbousman kat la.</p>}
    </article>)}
  </section>;
}
