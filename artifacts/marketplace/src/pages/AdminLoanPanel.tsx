import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Loader2, Star, CheckCircle, XCircle, Clock, AlertCircle, Info, ExternalLink, User, RotateCcw, TrendingUp } from "lucide-react";

interface LoanApplication {
  id: number;
  status: string;
  amount_requested: string;
  term_months: number;
  full_name: string;
  whatsapp: string;
  business_phone: string;
  city: string;
  country: string;
  business_name: string;
  business_category: string;
  business_description: string | null;
  monthly_sales_usd: string;
  identity_doc: string | null;
  business_photos: string[];
  product_photos: string[];
  business_docs: string[];
  facebook_url: string | null;
  tiktok_url: string | null;
  instagram_url: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  applicant_id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_avatar: string | null;
  applicant_rating: number;
  applicant_review_count: number;
  applicant_verified: boolean;
  applicant_joined: string;
  reviewer_name: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending_review:      { label: "Pending Review",      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",   icon: Clock },
  under_verification:  { label: "Under Verification",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",           icon: Info },
  approved:            { label: "Approved → Activate", color: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",   icon: CheckCircle },
  active:              { label: "Active (Repaying)",   color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle },
  completed:           { label: "Completed ✓",         color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",           icon: CheckCircle },
  rejected:            { label: "Rejected",             color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",               icon: XCircle },
  more_info_required:  { label: "More Info Required",   color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",   icon: AlertCircle },
};

interface Installment {
  id: number;
  loan_id: number;
  installment_number: number;
  due_date: string;
  amount_usd: string;
  status: string;
  paid_at: string | null;
  retry_count: number;
  last_retry_at: string | null;
  attempts: { result: string; error_msg: string | null; attempted_at: string; amount_usd: string }[] | null;
}

const INST_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  paid:    { label: "Paid ✓",   color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  failed:  { label: "Failed",   color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  overdue: { label: "Overdue !", color: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300" },
};

export default function AdminLoanPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<LoanApplication | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/admin/loans?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApps(data.applications ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openApp = async (app: LoanApplication) => {
    setSelected(app);
    setNewStatus(app.status);
    setReviewNote(app.reviewer_note ?? "");
    setInstallments([]);
    if (app.status === "active" || app.status === "completed") {
      setLoadingInst(true);
      try {
        const res = await fetch(`/api/admin/loans/${app.id}/installments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const d = await res.json(); setInstallments(d.installments ?? []); }
      } finally { setLoadingInst(false); }
    }
  };

  const retryInstallment = async (loanId: number, instId: number) => {
    setRetrying(instId);
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/installments/${instId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) {
        toast({ title: d.result === "success" ? "✅ Peman siksè!" : "❌ Balans ensifizant — echèk ankò" });
        if (selected) {
          const r = await fetch(`/api/admin/loans/${loanId}/installments`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) { const rd = await r.json(); setInstallments(rd.installments ?? []); }
          load();
        }
      } else {
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } finally { setRetrying(null); }
  };

  const saveReview = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/loans/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, reviewerNote: reviewNote }),
      });
      if (res.ok) {
        toast({ title: "Application updated" });
        setSelected(null);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Failed to update", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-HT", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Loan Applications</h2>
          <p className="text-sm text-muted-foreground">{total} total applications</p>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No applications found.</div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => {
            const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.pending_review;
            const Icon = cfg.icon;
            return (
              <div
                key={app.id}
                className="bg-card border border-border rounded-2xl p-4 cursor-pointer hover:border-primary/30 transition-all"
                onClick={() => openApp(app)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {app.applicant_avatar ? (
                      <img src={app.applicant_avatar} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm">{app.applicant_name}</p>
                      <p className="text-xs text-muted-foreground">{app.applicant_email}</p>
                      <p className="text-xs text-muted-foreground">{app.city}, {app.country}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg text-primary">${parseFloat(app.amount_requested).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{app.term_months} months</p>
                    <Badge className={`text-xs mt-1 ${cfg.color} border-0`}>
                      <Icon className="h-3 w-3 mr-1" />{cfg.label}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {(app.applicant_rating ?? 0).toFixed(1)} ({app.applicant_review_count})
                  </span>
                  {app.applicant_verified && <span className="text-emerald-600 font-medium">✓ Verified</span>}
                  <span>Business: {app.business_name ?? "—"}</span>
                  <span>Applied {fmt(app.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loan Application #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5 text-sm">
              {/* Applicant */}
              <Section title="Applicant">
                <Row label="Name" value={selected.applicant_name} />
                <Row label="Email" value={selected.applicant_email} />
                <Row label="Rating" value={`${(selected.applicant_rating ?? 0).toFixed(1)} ⭐ (${selected.applicant_review_count} reviews)`} />
                <Row label="Joined" value={fmt(selected.applicant_joined)} />
              </Section>

              {/* Loan */}
              <Section title="Loan Details">
                <Row label="Amount Requested" value={`$${parseFloat(selected.amount_requested).toFixed(2)}`} />
                <Row label="Term" value={`${selected.term_months} months`} />
                <Row label="Monthly Sales" value={selected.monthly_sales_usd ? `$${selected.monthly_sales_usd}` : "—"} />
              </Section>

              {/* Personal */}
              <Section title="Personal Info">
                <Row label="Full Name" value={selected.full_name} />
                <Row label="WhatsApp" value={selected.whatsapp} />
                <Row label="Business Phone" value={selected.business_phone} />
                <Row label="Emergency Phone" value={(selected as any).emergency_phone} />
                <Row label="Address" value={`${selected.city}, ${selected.country}`} />
              </Section>

              {/* Business */}
              <Section title="Business Info">
                <Row label="Business Name" value={selected.business_name} />
                <Row label="Category" value={selected.business_category} />
                <Row label="Description" value={selected.business_description} />
              </Section>

              {/* Social */}
              {(selected.facebook_url || selected.tiktok_url || selected.instagram_url) && (
                <Section title="Social Media">
                  {selected.facebook_url && <a href={selected.facebook_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" />Facebook</a>}
                  {selected.tiktok_url && <a href={selected.tiktok_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" />TikTok</a>}
                  {selected.instagram_url && <a href={selected.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" />Instagram</a>}
                </Section>
              )}

              {/* Photos */}
              {selected.identity_doc && (
                <Section title="Identity Document">
                  <a href={selected.identity_doc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><ExternalLink className="h-3 w-3" />View ID Document</a>
                </Section>
              )}
              {(selected.business_photos?.length > 0 || selected.product_photos?.length > 0) && (
                <Section title="Photos">
                  <div className="grid grid-cols-3 gap-2">
                    {[...( selected.business_photos ?? []), ...(selected.product_photos ?? [])].map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" className="rounded-lg h-20 w-full object-cover border border-border hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {/* Payment schedule */}
              {(selected.status === "active" || selected.status === "completed") && (
                <Section title="Payment Schedule">
                  {loadingInst ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : installments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No installments found.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Summary bar */}
                      {(() => {
                        const total = parseFloat((selected as any).total_repayment_usd ?? "0");
                        const paid  = parseFloat((selected as any).amount_paid_usd ?? "0");
                        const pct   = total > 0 ? Math.round((paid / total) * 100) : 0;
                        return (
                          <div className="mb-3">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Repaid ${paid.toFixed(2)} of ${total.toFixed(2)}</span>
                              <span className="font-semibold text-violet-600">{pct}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                      {/* Installment rows */}
                      {installments.map(inst => {
                        const sc = INST_STATUS[inst.status] ?? INST_STATUS.pending;
                        return (
                          <div key={inst.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              inst.status === "paid" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                            }`}>
                              {inst.installment_number}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold">${parseFloat(inst.amount_usd).toFixed(2)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {inst.status === "paid" && inst.paid_at
                                  ? `Paid ${fmt(inst.paid_at)}`
                                  : `Due ${fmt(inst.due_date)}`}
                                {inst.retry_count > 0 && ` · ${inst.retry_count} retry`}
                              </p>
                            </div>
                            <Badge className={`text-[10px] border-0 shrink-0 ${sc.color}`}>{sc.label}</Badge>
                            {(inst.status === "failed" || inst.status === "overdue") && (
                              <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px] shrink-0"
                                disabled={retrying === inst.id}
                                onClick={() => retryInstallment(selected.id, inst.id)}>
                                {retrying === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-2.5 w-2.5 mr-1" />Retry</>}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>
              )}

              {/* Review section */}
              <Section title="Admin Decision">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Reviewer Note (shown to applicant)</label>
                    <Textarea
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      placeholder="Add a note for the applicant..."
                      rows={3}
                    />
                  </div>
                  {(newStatus === "approved" || newStatus === "active") && (
                    <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 text-xs text-violet-800 dark:text-violet-300">
                      ⚡ Setting this to <strong>Approved / Active</strong> will immediately generate the monthly installment schedule and activate automatic repayments from the merchant's FM Wallet.
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={saveReview} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}
