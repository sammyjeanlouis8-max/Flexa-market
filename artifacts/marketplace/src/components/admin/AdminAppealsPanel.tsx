import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, 
  Flag, Loader2, Package, Search, ShieldAlert, UserX,
  XCircle, CornerUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAdminGetUsersQueryKey, getAdminGetListingsQueryKey, getAdminGetReportsQueryKey, getAdminGetStatsQueryKey } from "@workspace/api-client-react";

type Appeal = {
  id: number;
  targetType: "listing" | "user" | "report";
  targetId: number;
  requestedById: number;
  originalActorId: number | null;
  reason: string;
  status: "pending" | "decided";
  decision: "uphold" | "overturn" | null;
  decisionReason: string | null;
  decidedById: number | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminAppealsPanel({
  adminFetch,
  me,
  isSuperAdmin,
  onNavigateToTab
}: {
  adminFetch: (path: string, method?: string, body?: object) => Promise<any>;
  me: any;
  isSuperAdmin: boolean;
  onNavigateToTab: (tab: string, context?: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = isSuperAdmin || me?.role === "admin";
  
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");

  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [activeAppeal, setActiveAppeal] = useState<Appeal | null>(null);
  const [decision, setDecision] = useState<"uphold" | "overturn">("uphold");
  const [decisionReason, setDecisionReason] = useState("");

  // Create Appeal Dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAppealType, setNewAppealType] = useState<"user" | "listing" | "report">("user");
  const [newAppealTargetId, setNewAppealTargetId] = useState("");
  const [newAppealReason, setNewAppealReason] = useState("");

  const { data: appeals, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-appeals"],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/appeals`, "GET");
      return res as Appeal[];
    }
  });

  const filteredAppeals = appeals?.filter(a => {
    if (filterType !== "all" && a.targetType !== filterType) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (search && !a.reason.toLowerCase().includes(search.toLowerCase()) && 
        !a.targetId.toString().includes(search) &&
        !(a.decisionReason || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const onMutated = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetReportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
  };

  const openDecisionDialog = (appeal: Appeal, type: "uphold" | "overturn") => {
    setActiveAppeal(appeal);
    setDecision(type);
    setDecisionReason("");
    setDecisionDialogOpen(true);
  };

  const submitDecision = async () => {
    if (!activeAppeal || !decisionReason.trim()) return;
    try {
      await adminFetch(`/api/admin/appeals/${activeAppeal.id}/decision`, "POST", {
        decision,
        decisionReason
      });
      toast({ title: `Appeal ${decision}ed successfully` });
      setDecisionDialogOpen(false);
      onMutated();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const submitCreateAppeal = async () => {
    if (!newAppealTargetId || !newAppealReason.trim()) return;
    try {
      await adminFetch(`/api/admin/appeals`, "POST", {
        targetType: newAppealType,
        targetId: Number(newAppealTargetId),
        reason: newAppealReason
      });
      toast({ title: "Review request created successfully" });
      setCreateDialogOpen(false);
      setNewAppealTargetId("");
      setNewAppealReason("");
      onMutated();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const getTargetLink = (item: Appeal) => {
    if (item.targetType === "user") onNavigateToTab("users", { search: item.targetId.toString() });
    else if (item.targetType === "listing") onNavigateToTab("listings", { search: item.targetId.toString() });
    else if (item.targetType === "report") onNavigateToTab("reports", { search: item.targetId.toString() });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Appeals</div>
          <div className="text-2xl font-black">{appeals?.length ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setFilterStatus("pending")}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"> Pending Review</div>
          <div className="text-2xl font-black">{appeals?.filter(a => a.status === "pending").length ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-red-300 transition-colors" onClick={() => { setFilterStatus("decided"); }}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"> Decided</div>
          <div className="text-2xl font-black">{appeals?.filter(a => a.status === "decided").length ?? "-"}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-center bg-muted/40 p-3 rounded-xl border">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] bg-background"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="report">Reports</SelectItem>
              <SelectItem value="listing">Listings</SelectItem>
              <SelectItem value="user">Users</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Status</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
              <SelectItem value="decided">Decided</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 md:w-[250px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search appeals..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-9 bg-background" 
              data-testid="input-appeals-search"
            />
          </div>
        </div>
        <div className="flex gap-2 items-center w-full md:w-auto justify-end">
          <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh-appeals">
            <Loader2 className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-appeal">
            Create Review Request
          </Button>
        </div>
      </div>

      {/* Appeals List */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Loading appeals...</p>
          </div>
        ) : error ? (
          <div className="py-20 flex flex-col items-center justify-center text-destructive">
            <AlertCircle className="h-8 w-8 mb-4" />
            <p>Failed to load appeals. Please try again.</p>
          </div>
        ) : filteredAppeals.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4 opacity-50" />
            <p className="text-lg font-medium">No appeals found</p>
            <p className="text-sm">No items matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Target</th>
                  <th className="px-4 py-3 text-left font-semibold">Request</th>
                  <th className="px-4 py-3 text-left font-semibold">Decision</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAppeals.map(appeal => (
                  <tr key={appeal.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-appeal-${appeal.id}`}>
                    <td className="px-4 py-3">
                      {appeal.status === 'pending' ? (
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent text-[10px] uppercase tracking-wider">
                          Pending
                        </Badge>
                      ) : appeal.decision === 'uphold' ? (
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-transparent text-[10px] uppercase tracking-wider">
                          Upheld
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent text-[10px] uppercase tracking-wider">
                          Overturned
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium flex items-center gap-1.5 whitespace-nowrap">
                      {appeal.targetType === 'report' && <Flag className="h-3.5 w-3.5 text-red-500" />}
                      {appeal.targetType === 'listing' && <Package className="h-3.5 w-3.5 text-amber-500" />}
                      {appeal.targetType === 'user' && <UserX className="h-3.5 w-3.5 text-purple-500" />}
                      <span className="capitalize">{appeal.targetType}</span>
                      <span className="text-muted-foreground ml-1">#{appeal.targetId}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {format(new Date(appeal.createdAt), "MMM d, yyyy")} • By Admin #{appeal.requestedById}
                      </div>
                      <div className="truncate font-medium text-foreground">
                        {appeal.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      {appeal.status === 'decided' ? (
                         <>
                          <div className="text-xs text-muted-foreground mb-0.5">
                            {format(new Date(appeal.decidedAt!), "MMM d, yyyy")} • By Admin #{appeal.decidedById}
                          </div>
                          <div className="truncate font-medium text-foreground">
                            {appeal.decisionReason}
                          </div>
                         </>
                      ) : (
                         <span className="text-muted-foreground italic text-xs">Awaiting decision</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => getTargetLink(appeal)} data-testid={`link-view-appeal-${appeal.id}`}>
                        View <CornerUpRight className="h-3 w-3 ml-1" />
                      </Button>
                      
                      {appeal.status === "pending" && isAdmin && appeal.originalActorId !== me?.id && (
                        <>
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openDecisionDialog(appeal, "uphold")} data-testid={`btn-uphold-${appeal.id}`}>Uphold</Button>
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => openDecisionDialog(appeal, "overturn")} data-testid={`btn-overturn-${appeal.id}`}>Overturn</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decision Dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {decision} Appeal #{activeAppeal?.id}
            </DialogTitle>
            <DialogDescription>
              {decision === 'uphold' 
                ? "You are confirming the original moderation action was correct." 
                : "You are reversing the original moderation action."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Decision Reason <span className="text-destructive">*</span></label>
              <Textarea 
                value={decisionReason} 
                onChange={e => setDecisionReason(e.target.value)} 
                placeholder="Explain your decision for the audit log..."
                required
                data-testid="input-decision-reason"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(false)}>Cancel</Button>
            <Button 
              variant={decision === 'overturn' ? "destructive" : "default"}
              onClick={submitDecision}
              disabled={!decisionReason.trim()}
              data-testid="button-confirm-decision"
            >
              Confirm Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Appeal Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Request Review / Appeal
            </DialogTitle>
            <DialogDescription>
              Submit a previous moderation action or report for peer/admin review.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Target Type</label>
                <Select value={newAppealType} onValueChange={(v: any) => setNewAppealType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="listing">Listing</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Target ID <span className="text-destructive">*</span></label>
                <Input 
                  type="number" 
                  value={newAppealTargetId} 
                  onChange={e => setNewAppealTargetId(e.target.value)} 
                  placeholder="e.g. 12345"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold">Reason for Review <span className="text-destructive">*</span></label>
              <Textarea 
                value={newAppealReason} 
                onChange={e => setNewAppealReason(e.target.value)} 
                placeholder="Why should this be reviewed or overturned?"
                required
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={submitCreateAppeal}
              disabled={!newAppealTargetId || !newAppealReason.trim()}
              data-testid="button-submit-appeal"
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
