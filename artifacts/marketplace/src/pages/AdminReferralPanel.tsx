import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}
async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const r = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Flag, AlertTriangle, Edit3, CheckCircle2, RefreshCw, TrendingUp } from "lucide-react";

interface Referral {
  id: number;
  referrerId: number;
  referredUserId: number;
  status: string;
  pointsAwarded: number;
  isFlagged: boolean;
  flagReason: string | null;
  adminNote: string | null;
  ipAddress: string | null;
  deviceId: string | null;
  createdAt: string;
  referrerName: string;
  referrerEmail: string;
  referredName: string;
  referredEmail: string;
}

interface ReferralStats {
  total: number;
  flagged: number;
  totalPoints: number;
}

interface AdjustDialogState {
  referral: Referral | null;
  points: number;
  note: string;
}

interface FlagDialogState {
  referral: Referral | null;
  flag: boolean;
  reason: string;
  revokePoints: boolean;
}

export default function AdminReferralPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState<AdjustDialogState>({ referral: null, points: 0, note: "" });
  const [flagDialog, setFlagDialog] = useState<FlagDialogState>({ referral: null, flag: true, reason: "", revokePoints: false });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/admin/referrals/stats"],
    queryFn: () => apiGet("/api/admin/referrals/stats"),
  });

  const { data, isLoading, refetch } = useQuery<{
    referrals: Referral[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/admin/referrals", page, flaggedOnly],
    queryFn: () => apiGet(`/api/admin/referrals?page=${page}&limit=50${flaggedOnly ? "&flagged=true" : ""}`),
  });

  const adjustMut = useMutation({
    mutationFn: ({ id, points, adminNote }: { id: number; points: number; adminNote: string }) =>
      apiPut(`/api/admin/referrals/${id}/adjust`, { points, adminNote }),
    onSuccess: () => {
      toast({ title: "Points updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/referrals/stats"] });
      setAdjustDialog({ referral: null, points: 0, note: "" });
    },
    onError: () => toast({ title: "Failed to adjust points", variant: "destructive" }),
  });

  const flagMut = useMutation({
    mutationFn: ({ id, flag, reason, revokePoints }: { id: number; flag: boolean; reason: string; revokePoints: boolean }) =>
      apiPut(`/api/admin/referrals/${id}/flag`, { flag, reason, revokePoints }),
    onSuccess: () => {
      toast({ title: "Referral updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/referrals/stats"] });
      setFlagDialog({ referral: null, flag: true, reason: "", revokePoints: false });
    },
    onError: () => toast({ title: "Failed to update referral", variant: "destructive" }),
  });

  const referrals = data?.referrals ?? [];

  function statusColor(status: string) {
    if (status === "verified") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30";
    if (status === "flagged") return "bg-red-100 text-red-700 dark:bg-red-900/30";
    return "bg-gray-100 text-gray-600 dark:bg-gray-800";
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {statsLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : stats ? (
          <>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Referrals</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                <div className="text-2xl font-bold text-red-600">{stats.flagged}</div>
                <div className="text-xs text-muted-foreground">Flagged</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                <div className="text-2xl font-bold text-emerald-600">{stats.totalPoints}</div>
                <div className="text-xs text-muted-foreground">Total Points</div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Filter + Refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch id="flagged-only" checked={flaggedOnly} onCheckedChange={v => { setFlaggedOnly(v); setPage(1); }} />
          <Label htmlFor="flagged-only" className="text-sm cursor-pointer flex items-center gap-1">
            <Flag className="h-3.5 w-3.5 text-red-500" />
            Suspicious only
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">{data?.total ?? 0} total</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : referrals.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No referrals found</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Referrer</th>
                  <th className="text-left px-3 py-2 font-medium">Referred</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Points</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {referrals.map(r => (
                  <tr key={r.id} className={r.isFlagged ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.referrerName}</div>
                      <div className="text-xs text-muted-foreground">{r.referrerEmail}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.referredName}</div>
                      <div className="text-xs text-muted-foreground">{r.referredEmail}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(r.status)}`}>
                        {r.isFlagged && <AlertTriangle className="h-3 w-3" />}
                        {r.status}
                      </span>
                      {r.flagReason && <div className="text-xs text-red-600 mt-0.5">{r.flagReason}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${r.pointsAwarded > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {r.pointsAwarded > 0 ? `+${r.pointsAwarded}` : "0"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setAdjustDialog({ referral: r, points: r.pointsAwarded, note: r.adminNote ?? "" })}
                        >
                          <Edit3 className="h-3 w-3 mr-1" />Pts
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 text-xs ${r.isFlagged ? "text-emerald-600" : "text-red-600"}`}
                          onClick={() => setFlagDialog({ referral: r, flag: !r.isFlagged, reason: r.flagReason ?? "", revokePoints: false })}
                        >
                          {r.isFlagged ? <><CheckCircle2 className="h-3 w-3 mr-1" />Clear</> : <><Flag className="h-3 w-3 mr-1" />Flag</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm">{page} / {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      {/* Adjust Points Dialog */}
      <Dialog open={!!adjustDialog.referral} onOpenChange={open => !open && setAdjustDialog({ referral: null, points: 0, note: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Referral Points</DialogTitle>
          </DialogHeader>
          {adjustDialog.referral && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Referral from <strong>{adjustDialog.referral.referrerName}</strong> for <strong>{adjustDialog.referral.referredName}</strong>
              </div>
              <div className="space-y-2">
                <Label>New point value</Label>
                <Input
                  type="number"
                  min={0}
                  value={adjustDialog.points}
                  onChange={e => setAdjustDialog(s => ({ ...s, points: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Admin note (optional)</Label>
                <Textarea
                  rows={2}
                  value={adjustDialog.note}
                  onChange={e => setAdjustDialog(s => ({ ...s, note: e.target.value }))}
                  placeholder="Reason for adjustment…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog({ referral: null, points: 0, note: "" })}>Cancel</Button>
            <Button
              disabled={adjustMut.isPending}
              onClick={() => adjustDialog.referral && adjustMut.mutate({
                id: adjustDialog.referral.id,
                points: adjustDialog.points,
                adminNote: adjustDialog.note,
              })}
            >
              {adjustMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag Dialog */}
      <Dialog open={!!flagDialog.referral} onOpenChange={open => !open && setFlagDialog({ referral: null, flag: true, reason: "", revokePoints: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{flagDialog.flag ? "Flag Suspicious Referral" : "Clear Flag"}</DialogTitle>
          </DialogHeader>
          {flagDialog.referral && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Referral from <strong>{flagDialog.referral.referrerName}</strong>
              </div>
              {flagDialog.flag && (
                <>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Input
                      value={flagDialog.reason}
                      onChange={e => setFlagDialog(s => ({ ...s, reason: e.target.value }))}
                      placeholder="e.g. Same IP address"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="revoke-pts"
                      checked={flagDialog.revokePoints}
                      onCheckedChange={v => setFlagDialog(s => ({ ...s, revokePoints: v }))}
                    />
                    <Label htmlFor="revoke-pts" className="text-sm cursor-pointer">
                      Also revoke {flagDialog.referral.pointsAwarded} pts from referrer
                    </Label>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialog({ referral: null, flag: true, reason: "", revokePoints: false })}>Cancel</Button>
            <Button
              variant={flagDialog.flag ? "destructive" : "default"}
              disabled={flagMut.isPending}
              onClick={() => flagDialog.referral && flagMut.mutate({
                id: flagDialog.referral.id,
                flag: flagDialog.flag,
                reason: flagDialog.reason,
                revokePoints: flagDialog.revokePoints,
              })}
            >
              {flagMut.isPending ? "Saving…" : flagDialog.flag ? "Flag Referral" : "Clear Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
