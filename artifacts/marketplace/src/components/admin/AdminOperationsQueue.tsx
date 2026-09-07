import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Flag, Loader2, MessageSquare, MoreHorizontal, AlertCircle,
  Package, Search, ShieldAlert, UserX, AlertOctagon, CornerUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAdminGetUsersQueryKey, getAdminGetListingsQueryKey, getAdminGetReportsQueryKey, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";

type OperationItem = {
  id: number;
  type: "report" | "listing" | "user" | "support";
  priority: "urgent" | "high" | "normal" | "low";
  assignment: number | null;
  country: string | null;
  city: string | null;
  risk: "low" | "medium" | "high" | null;
  createdAt: string;
  data: any;
};

export default function AdminOperationsQueue({
  adminFetch,
  me,
  allUsers,
  onNavigateToTab
}: {
  adminFetch: (path: string, method?: string, body?: object) => Promise<any>;
  me: any;
  allUsers: any[];
  onNavigateToTab: (tab: string, context?: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const staffOptions = allUsers.filter(u => !u.isBanned && (u.role === "moderator" || u.role === "admin" || u.isSuperAdmin));

  const [type, setType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [assignment, setAssignment] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<string | null>(null);

  // Bulk action dialog state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkDuration, setBulkDuration] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  
  // Single action dialog state
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [singleItem, setSingleItem] = useState<OperationItem | null>(null);
  const [singleAction, setSingleAction] = useState("");

  // Appeal creation state
  const [appealDialogOpen, setAppealDialogOpen] = useState(false);
  const [appealItem, setAppealItem] = useState<OperationItem | null>(null);
  const [appealReason, setAppealReason] = useState("");

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedCity(city);
    }, 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, city]);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkActionType(null);
    setPage(1);
  }, [type, priority, assignment, risk, country, debouncedCity, dateFrom, dateTo, debouncedSearch]);

  const queryKey = ["admin-action-queue", type, priority, assignment, risk, country, debouncedCity, dateFrom, dateTo, debouncedSearch, page];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      if (type !== "all") params.set("type", type);
      if (priority !== "all") params.set("priority", priority);
      if (assignment !== "all") params.set("assignment", assignment);
      if (risk !== "all") params.set("risk", risk);
      if (country !== "all") params.set("country", country);
      if (debouncedCity) params.set("city", debouncedCity);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (debouncedSearch) params.set("q", debouncedSearch);
      
      const res = await adminFetch(`/api/admin/action-queue?${params.toString()}`, "GET");
      return res as {
        counts: { total: number; reports: number; listings: number; users: number; support: number };
        page: number;
        limit: number;
        total: number;
        items: OperationItem[];
      };
    }
  });

  const onMutated = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetReportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
    setSelectedIds(new Set());
    setBulkActionType(null);
  };

  const toggleSelection = (item: OperationItem) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(item.id)) {
      newSet.delete(item.id);
      if (newSet.size === 0) setBulkActionType(null);
    } else {
      if (item.type === "support") {
        toast({ title: "Bulk actions not supported for support threads", variant: "destructive" });
        return;
      }
      if (bulkActionType && bulkActionType !== item.type) {
        toast({ title: "Cannot mix different item types in bulk selection", variant: "destructive" });
        return;
      }
      newSet.add(item.id);
      setBulkActionType(item.type);
    }
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
      setBulkActionType(null);
    } else {
      const validItems = data.items.filter(i => i.type !== "support");
      if (validItems.length === 0) return;
      const firstType = validItems[0].type;
      const uniformItems = validItems.filter(i => i.type === firstType);
      setSelectedIds(new Set(uniformItems.map(i => i.id)));
      setBulkActionType(firstType);
      if (uniformItems.length < validItems.length) {
         toast({ title: "Selected only " + firstType + " items to prevent mixing types." });
      }
    }
  };

  const claimSupport = async (id: number) => {
    try {
      await adminFetch(`/api/support/threads/${id}/claim`, "POST", {});
      toast({ title: "Thread claimed successfully" });
      onMutated();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const executeBulkAction = async () => {
    if (selectedIds.size === 0 || !bulkActionType || !bulkAction) return;
    
    let path = "";
    if (bulkActionType === "user") path = "/api/admin/users/bulk";
    if (bulkActionType === "listing") path = "/api/admin/listings/bulk";
    if (bulkActionType === "report") path = "/api/admin/reports/bulk";
    
    const body: any = {
      ids: Array.from(selectedIds),
      action: bulkAction,
    };
    if (bulkReason) {
      body.reason = bulkReason;
      if (bulkActionType === "report" && (bulkAction === "resolve" || bulkAction === "dismiss")) body.resolution = bulkReason;
    }
    if (bulkDuration && bulkAction === "restrict") body.durationDays = Number(bulkDuration);
    if (bulkAssignee && bulkAction === "assign") body.assignedAdminId = Number(bulkAssignee);

    try {
      const res = await adminFetch(path, "POST", body);
      toast({ 
        title: `Operation complete`, 
        description: `${res.summary.succeeded} succeeded, ${res.summary.failed} failed.` 
      });
      setBulkDialogOpen(false);
      onMutated();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const executeSingleAction = async () => {
    if (!singleItem || !singleAction) return;
    
    const type = singleItem.type;
    let path = "";
    if (type === "user") path = "/api/admin/users/bulk";
    if (type === "listing") path = "/api/admin/listings/bulk";
    if (type === "report" && singleAction === "assign") path = `/api/admin/reports/${singleItem.id}/assign`;
    else if (type === "report") path = `/api/admin/reports/${singleItem.id}/decision`;
    
    const body: any = {};
    if (type === "user" || type === "listing") {
      body.ids = [singleItem.id];
      body.action = singleAction;
    }
    if (singleAction === "assign") body.assignedAdminId = Number(bulkAssignee);
    else if (type === "report") {
      body.decision = singleAction;
      body.resolution = bulkReason;
    } else {
      body.reason = bulkReason;
      if (singleAction === "restrict" && bulkDuration) body.durationDays = Number(bulkDuration);
    }
    
    try {
      await adminFetch(path, "POST", body);
      toast({ title: `Action applied to ${type}` });
      setSingleDialogOpen(false);
      onMutated();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const openBulkDialog = (action: string) => {
    setBulkAction(action);
    setBulkReason("");
    setBulkDuration("");
    setBulkAssignee("");
    setBulkDialogOpen(true);
  };
  
  const openSingleDialog = (item: OperationItem, action: string) => {
    setSingleItem(item);
    setSingleAction(action);
    setBulkReason("");
    setBulkDuration("");
    setBulkAssignee("");
    setSingleDialogOpen(true);
  };

  const openAppealDialog = (item: OperationItem) => {
    setAppealItem(item);
    setAppealReason("");
    setAppealDialogOpen(true);
  };

  const submitAppeal = async () => {
    if (!appealItem || !appealReason.trim()) return;
    try {
      await adminFetch(`/api/admin/appeals`, "POST", {
        targetType: appealItem.type,
        targetId: appealItem.id,
        reason: appealReason
      });
      toast({ title: "Review request submitted" });
      setAppealDialogOpen(false);
      onNavigateToTab("appeals");
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const priorityColor = {
    urgent: "bg-red-500 text-white",
    high: "bg-orange-500 text-white",
    normal: "bg-blue-500 text-white",
    low: "bg-gray-500 text-white"
  };

  const getTargetLink = (item: OperationItem) => {
    if (item.type === "user") onNavigateToTab("users", { search: item.data.name });
    else if (item.type === "listing") onNavigateToTab("listings", { search: item.data.title });
    else if (item.type === "report") onNavigateToTab("reports", { search: item.id.toString() });
    else if (item.type === "support") onNavigateToTab("support", { thread: item.id });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Queue</div>
          <div className="text-2xl font-black">{data?.counts.total ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setType("report")}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"><Flag className="h-3 w-3 mr-1"/> Reports</div>
          <div className="text-2xl font-black">{data?.counts.reports ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-amber-300 transition-colors" onClick={() => setType("listing")}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"><Package className="h-3 w-3 mr-1"/> Listings</div>
          <div className="text-2xl font-black">{data?.counts.listings ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-red-300 transition-colors" onClick={() => setType("user")}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"><UserX className="h-3 w-3 mr-1"/> Users</div>
          <div className="text-2xl font-black">{data?.counts.users ?? "-"}</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col justify-center cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => setType("support")}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"><MessageSquare className="h-3 w-3 mr-1"/> Support</div>
          <div className="text-2xl font-black">{data?.counts.support ?? "-"}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 bg-muted/20 p-3 rounded-xl border">
        <div className="flex flex-wrap gap-2 w-full justify-between items-center">
          <div className="flex flex-wrap gap-2 flex-1">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[120px] bg-background h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="listing">Listings</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-[120px] bg-background h-8 text-xs"><SelectValue placeholder="All Priorities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignment} onValueChange={setAssignment}>
              <SelectTrigger className="w-[130px] bg-background h-8 text-xs"><SelectValue placeholder="Assignment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Assignment</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="me">Assigned to Me</SelectItem>
              </SelectContent>
            </Select>
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger className="w-[110px] bg-background h-8 text-xs"><SelectValue placeholder="All Risks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="medium">Med Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
              </SelectContent>
            </Select>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-[130px] bg-background h-8 text-xs"><SelectValue placeholder="All Countries" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {SUPPORTED_COUNTRIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              placeholder="City..." 
              value={city} 
              onChange={e => setCity(e.target.value)} 
              className="w-[110px] h-8 text-xs bg-background" 
            />
            <div className="flex items-center gap-1">
              <Input 
                type="date" 
                value={dateFrom} 
                onChange={e => setDateFrom(e.target.value)} 
                className="w-[120px] h-8 text-xs bg-background" 
              />
              <span className="text-muted-foreground text-xs">-</span>
              <Input 
                type="date" 
                value={dateTo} 
                onChange={e => setDateTo(e.target.value)} 
                className="w-[120px] h-8 text-xs bg-background" 
              />
            </div>
            
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Search..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                className="pl-8 h-8 text-xs bg-background" 
                data-testid="input-queue-search"
              />
            </div>
          </div>

          <div className="flex gap-2 items-center flex-shrink-0">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} data-testid="button-refresh-queue">
              <Loader2 className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            {selectedIds.size > 0 && bulkActionType === "user" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-blue-600 text-white hover:bg-blue-700" data-testid="button-bulk-actions">
                  Actions ({selectedIds.size}) <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openBulkDialog("clear_flag")}>Clear Flags</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("restrict")} className="text-red-600">Restrict Accounts</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("unrestrict")}>Unrestrict Accounts</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedIds.size > 0 && bulkActionType === "listing" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-amber-600 text-white hover:bg-amber-700" data-testid="button-bulk-actions">
                  Actions ({selectedIds.size}) <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openBulkDialog("approve")} className="text-emerald-600">Approve Selected</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("reject")} className="text-red-600">Reject Selected</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("remove")} className="text-red-600">Remove Selected</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedIds.size > 0 && bulkActionType === "report" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-red-600 text-white hover:bg-red-700" data-testid="button-bulk-actions">
                  Actions ({selectedIds.size}) <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openBulkDialog("assign")}>Assign to...</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("resolve")} className="text-emerald-600">Resolve Reports</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkDialog("dismiss")} className="text-muted-foreground">Dismiss Reports</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        </div>
      </div>

      {/* Queue List */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Loading operation queue...</p>
          </div>
        ) : error ? (
          <div className="py-20 flex flex-col items-center justify-center text-destructive">
            <AlertCircle className="h-8 w-8 mb-4" />
            <p>Failed to load queue. Please try again.</p>
          </div>
        ) : data?.items.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4 opacity-50" />
            <p className="text-lg font-medium">All clear</p>
            <p className="text-sm">No items matching your criteria require attention.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left w-[40px]">
                    <Checkbox 
                      checked={!!data?.items?.length && data.items.filter(i => i.type !== 'support').length > 0 && selectedIds.size === data.items.filter(i=>i.type!=='support').length} 
                      onCheckedChange={toggleAll}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Context</th>
                  <th className="px-4 py-3 text-left font-semibold">Details</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.map(item => (
                  <tr key={`${item.type}-${item.id}`} className={`hover:bg-muted/30 transition-colors ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`} data-testid={`row-queue-${item.id}`}>
                    <td className="px-4 py-3">
                      {item.type !== "support" && (
                        <Checkbox 
                          checked={selectedIds.has(item.id)} 
                          onCheckedChange={() => toggleSelection(item)}
                          data-testid={`checkbox-select-${item.id}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`${priorityColor[item.priority]} border-transparent text-[10px] uppercase tracking-wider`}>
                        {item.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium flex items-center gap-1.5">
                      {item.type === 'report' && <Flag className="h-3.5 w-3.5 text-red-500" />}
                      {item.type === 'listing' && <Package className="h-3.5 w-3.5 text-amber-500" />}
                      {item.type === 'user' && <UserX className="h-3.5 w-3.5 text-purple-500" />}
                      {item.type === 'support' && <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />}
                      <span className="capitalize">{item.type}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span>{format(new Date(item.createdAt), "MMM d, HH:mm")}</span>
                        {(item.city || item.country) && <span>{item.city}{item.city && item.country ? ', ' : ''}{item.country}</span>}
                        {item.risk === 'high' && <span className="text-red-500 font-bold flex items-center"><AlertTriangle className="h-3 w-3 mr-0.5"/> High Risk</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <div className="truncate font-medium text-foreground">
                        {item.type === 'report' && <>{item.data.target?.label} <span className="text-muted-foreground font-normal">({item.data.targetType})</span></>}
                        {item.type === 'listing' && item.data.title}
                        {item.type === 'user' && item.data.name}
                        {item.type === 'support' && item.data.subject}
                      </div>
                      <div className="truncate text-xs text-muted-foreground mt-0.5">
                        {item.type === 'report' && item.data.reason}
                        {item.type === 'listing' && (item.data.moderationReason || "Pending review")}
                        {item.type === 'user' && item.data.flagReason}
                        {item.type === 'support' && item.data.lastMessage}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => getTargetLink(item)} data-testid={`link-view-${item.id}`}>
                        View <CornerUpRight className="h-3 w-3 ml-1" />
                      </Button>
                      
                      {item.type === "support" && !item.assignment && (
                        <Button size="sm" variant="outline" onClick={() => claimSupport(item.id)} data-testid={`btn-claim-${item.id}`}>Claim</Button>
                      )}
                      
                      {item.type === "report" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`menu-actions-${item.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "assign")}>Assign</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "resolve")} className="text-emerald-600">Resolve</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "dismiss")} className="text-muted-foreground">Dismiss</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAppealDialog(item)}>Request Review</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      
                      {item.type === "listing" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`menu-actions-${item.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "approve")} className="text-emerald-600">Approve</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "reject")} className="text-red-600">Reject</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "remove")} className="text-red-600">Remove</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAppealDialog(item)}>Request Review</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {item.type === "user" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`menu-actions-${item.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "clear_flag")}>Clear Flag</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "restrict")} className="text-red-600">Restrict Account</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleDialog(item, "unrestrict")}>Unrestrict Account</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAppealDialog(item)}>Request Review</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {data && data.total > data.limit && (
          <div className="bg-muted/30 border-t p-3 flex justify-between items-center text-sm text-muted-foreground">
            <div>
              Showing {(page - 1) * data.limit + 1} to {Math.min(page * data.limit, data.total)} of {data.total}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * data.limit >= data.total}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-destructive" />
              {bulkAction.replace("_", " ")} {selectedIds.size} {bulkActionType}s
            </DialogTitle>
            <DialogDescription>
              You are about to perform a bulk operation. Please provide required details below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {bulkAction === "assign" ? (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Assign To</label>
                <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffOptions.map(u => (
                      <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                {(bulkAction === "restrict" || bulkAction === "reject" || bulkAction === "remove" || bulkAction === "resolve" || bulkAction === "dismiss") && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Reason / Resolution <span className="text-destructive">*</span></label>
                    <Textarea 
                      value={bulkReason} 
                      onChange={e => setBulkReason(e.target.value)} 
                      placeholder="Explain your decision..."
                      required
                      data-testid="input-bulk-reason"
                    />
                  </div>
                )}
                {bulkAction === "restrict" && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Duration (Days)</label>
                    <Input 
                      type="number" 
                      value={bulkDuration} 
                      onChange={e => setBulkDuration(e.target.value)} 
                      placeholder="Leave blank for permanent"
                      data-testid="input-bulk-duration"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button 
              variant={["reject", "remove", "restrict", "dismiss"].includes(bulkAction) ? "destructive" : "default"}
              onClick={executeBulkAction}
              disabled={
                (["restrict", "reject", "remove", "resolve", "dismiss"].includes(bulkAction) && !bulkReason.trim()) ||
                (bulkAction === "assign" && !bulkAssignee)
              }
              data-testid="button-confirm-bulk"
            >
              Confirm Bulk Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Action Dialog */}
      <Dialog open={singleDialogOpen} onOpenChange={setSingleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {singleAction.replace("_", " ")} {singleItem?.type}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {singleAction === "assign" ? (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Assign To</label>
                <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffOptions.map(u => (
                      <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                {(singleAction === "restrict" || singleAction === "reject" || singleAction === "remove" || singleAction === "resolve" || singleAction === "dismiss") && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Reason / Resolution <span className="text-destructive">*</span></label>
                    <Textarea 
                      value={bulkReason} 
                      onChange={e => setBulkReason(e.target.value)} 
                      placeholder="Explain your decision..."
                      required
                      data-testid="input-single-reason"
                    />
                  </div>
                )}
                {singleAction === "restrict" && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Duration (Days)</label>
                    <Input 
                      type="number" 
                      value={bulkDuration} 
                      onChange={e => setBulkDuration(e.target.value)} 
                      placeholder="Leave blank for permanent"
                      data-testid="input-single-duration"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleDialogOpen(false)}>Cancel</Button>
            <Button 
              variant={["reject", "remove", "restrict", "dismiss"].includes(singleAction) ? "destructive" : "default"}
              onClick={executeSingleAction}
              disabled={
                (["restrict", "reject", "remove", "resolve", "dismiss"].includes(singleAction) && !bulkReason.trim()) ||
                (singleAction === "assign" && !bulkAssignee)
              }
              data-testid="button-confirm-single"
            >
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appeal Dialog */}
      <Dialog open={appealDialogOpen} onOpenChange={setAppealDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Request Review
            </DialogTitle>
            <DialogDescription>
              Submit this {appealItem?.type} for peer or admin review.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Reason for Review <span className="text-destructive">*</span></label>
              <Textarea 
                value={appealReason} 
                onChange={e => setAppealReason(e.target.value)} 
                placeholder="Why should this be reviewed?"
                required
                data-testid="input-appeal-reason"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={submitAppeal}
              disabled={!appealReason.trim()}
              data-testid="button-confirm-appeal"
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
