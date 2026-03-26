import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStandards, useTags } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, LogOut, ArrowLeft, GripVertical, Sparkles, Users, Search, Flag, RefreshCw, ChevronDown, FileText, Link2, Merge, MessageSquareX, PackageX } from "lucide-react";
import { AiIngestion } from "@/components/AiIngestion";
import { DiscoverStandards } from "@/components/DiscoverStandards";
import { StandardsFilterBar } from "@/components/StandardsFilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DeduplicateDialog } from "@/components/DeduplicateDialog";

type StatusType = "Backlog" | "Emerging" | "Draft" | "Approved";

const COLUMNS: { status: StatusType; label: string; color: string; description: string }[] = [
  { status: "Backlog", label: "Backlog", color: "hsl(270 40% 55%)", description: "Unpublished — work-in-progress" },
  { status: "Emerging", label: "Emerging", color: "hsl(38 80% 55%)", description: "Under evaluation" },
  { status: "Draft", label: "Draft", color: "hsl(220 60% 55%)", description: "In active development" },
  { status: "Approved", label: "Approved", color: "hsl(152 60% 42%)", description: "Finalized" },
];

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { data: standards, isLoading, error } = useStandards();
  const { data: tags } = useTags();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: pendingFlagCount } = useQuery({
    queryKey: ["standard-flags-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("standard_flags")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: summaryStandardIds } = useQuery({
    queryKey: ["summary-standard-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standard_summaries")
        .select("standard_id");
      if (error) throw error;
      return new Set((data || []).map((s) => s.standard_id));
    },
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<StatusType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [filterNoResources, setFilterNoResources] = useState(false);
  const [filterNoSummaries, setFilterNoSummaries] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [deduplicateOpen, setDeduplicateOpen] = useState(false);
  const [confirmClearSubmissions, setConfirmClearSubmissions] = useState(false);
  const [confirmClearFeedback, setConfirmClearFeedback] = useState(false);
  const [clearing, setClearing] = useState(false);
  const allTags = useMemo(() => tags?.map((t) => t.name) || [], [tags]);
  const allOrganizations = useMemo(() => {
    if (!standards) return [];
    const orgs = new Set(standards.filter((s) => s.organization).map((s) => s.organization!));
    return [...orgs].sort();
  }, [standards]);

  const handleBulkEnrichResources = async () => {
    if (!standards) return;
    const needsResources = standards.filter(
      (s) => s.link && (!s.resources || (Array.isArray(s.resources) && (s.resources as any[]).length === 0))
    );
    if (needsResources.length === 0) {
      toast({ title: "Nothing to enrich", description: "All standards with links already have resources." });
      return;
    }
    setBulkEnriching(true);
    setBulkAction("enrich");
    let enriched = 0;
    let failed = 0;
    for (const s of needsResources) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("analyze-standard", {
          body: { url: s.link },
        });
        if (fnError || !data?.success) { failed++; continue; }
        const newResources = data.data?.resources;
        if (!newResources || newResources.length === 0) { continue; }
        const { error: updateError } = await supabase
          .from("standards")
          .update({ resources: newResources })
          .eq("id", s.id);
        if (updateError) { failed++; } else { enriched++; }
      } catch {
        failed++;
      }
    }
    setBulkEnriching(false);
    setBulkAction(null);
    qc.invalidateQueries({ queryKey: ["standards"] });
    toast({
      title: "Bulk enrich complete",
      description: `${enriched} enriched, ${failed} failed, ${needsResources.length - enriched - failed} had no new resources.`,
    });
  };

  const handleBulkGenerateSummaries = async () => {
    if (!standards) return;
    // Find standards that have resources
    const withResources = standards.filter(
      (s) => s.resources && Array.isArray(s.resources) && (s.resources as any[]).length > 0
    );
    if (withResources.length === 0) {
      toast({ title: "Nothing to summarize", description: "No standards have resources yet." });
      return;
    }
    // Check which already have summaries
    const { data: existingSummaries } = await supabase
      .from("standard_summaries")
      .select("standard_id");
    const summarizedIds = new Set((existingSummaries || []).map((s) => s.standard_id));
    const needsSummary = withResources.filter((s) => !summarizedIds.has(s.id));
    if (needsSummary.length === 0) {
      toast({ title: "All up to date", description: "All standards with resources already have summaries." });
      return;
    }
    setBulkEnriching(true);
    setBulkAction("summaries");
    let generated = 0;
    let failed = 0;
    for (const s of needsSummary) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("summarize-mailing-list", {
          body: { standard_id: s.id },
        });
        if (fnError) { failed++; continue; }
        const updated = (data?.results || []).filter((r: any) => r.status === "updated").length;
        if (updated > 0) { generated++; } else { failed++; }
      } catch {
        failed++;
      }
    }
    setBulkEnriching(false);
    setBulkAction(null);
    qc.invalidateQueries({ queryKey: ["standards"] });
    toast({
      title: "Bulk summaries complete",
      description: `${generated} generated, ${failed} failed out of ${needsSummary.length}.`,
    });
  };

  const handleClearCommunitySubmissions = async () => {
    setClearing(true);
    const { error } = await supabase
      .from("standards")
      .delete()
      .eq("status", "Backlog")
      .contains("tags", ["community-submission"]);
    setClearing(false);
    setConfirmClearSubmissions(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cleared", description: "All community submissions have been removed from the Backlog." });
      qc.invalidateQueries({ queryKey: ["standards"] });
    }
  };

  const handleClearFeedback = async () => {
    setClearing(true);
    const { error } = await supabase
      .from("standard_flags")
      .delete()
      .eq("status", "pending");
    setClearing(false);
    setConfirmClearFeedback(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cleared", description: "All pending feedback has been removed." });
      qc.invalidateQueries({ queryKey: ["standard-flags-count"] });
      qc.invalidateQueries({ queryKey: ["standard-flags"] });
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <p className="text-muted-foreground text-center">You don't have admin access.</p>
      <Button variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("standards").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["standards"] });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: StatusType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: StatusType) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedId) return;
    const standard = standards?.find((s) => s.id === draggedId);
    if (!standard || standard.status === newStatus) { setDraggedId(null); return; }

    qc.setQueryData(["standards"], (old: Standard[] | undefined) =>
      old?.map((s) => (s.id === draggedId ? { ...s, status: newStatus } : s))
    );
    const { error } = await supabase.from("standards").update({ status: newStatus }).eq("id", draggedId);
    if (error) {
      toast({ title: "Error moving card", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["standards"] });
    } else {
      toast({ title: `Moved to ${newStatus}` });
      qc.invalidateQueries({ queryKey: ["standards"] });
    }
    setDraggedId(null);
  };

  const columnStandards = (status: StatusType) => {
    let regex: RegExp | null = null;
    if (adminSearch.trim()) {
      try { regex = new RegExp(adminSearch.trim(), "i"); } catch { /* invalid regex */ }
    }
    return (standards || []).filter((s) => {
      if (s.status !== status) return false;
      if (regex && !regex.test(s.title) && !(s.acronym && regex.test(s.acronym))) return false;
      if (!regex && adminSearch.trim()) {
        const q = adminSearch.toLowerCase();
        if (!s.title.toLowerCase().includes(q) && !(s.acronym && s.acronym.toLowerCase().includes(q))) return false;
      }
      if (selectedTags.length > 0 && !selectedTags.some((tag) => s.tags?.includes(tag))) return false;
      if (selectedOrgs.length > 0 && (!s.organization || !selectedOrgs.includes(s.organization))) return false;
      if (filterNoResources && s.resources && Array.isArray(s.resources) && (s.resources as any[]).length > 0) return false;
      if (filterNoSummaries && summaryStandardIds?.has(s.id)) return false;
      return true;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold text-foreground">Standards Board</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/users")} className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Team
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/feedback")} className="gap-1.5 relative">
              <Flag className="h-3.5 w-3.5" /> Feedback
              {!!pendingFlagCount && pendingFlagCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground tabular-nums">
                  {pendingFlagCount}
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDiscoverOpen(true)} className="gap-1.5">
              <Search className="h-3.5 w-3.5" /> Discover
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={bulkEnriching} className="gap-1.5">
                  <RefreshCw className={cn("h-3.5 w-3.5", bulkEnriching && "animate-spin")} />
                  {bulkEnriching
                    ? bulkAction === "summaries" ? "Generating…" : "Enriching…"
                    : "Bulk Actions"}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleBulkEnrichResources} disabled={bulkEnriching} className="gap-2">
                  <Link2 className="h-3.5 w-3.5" /> Enrich Resources
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBulkGenerateSummaries} disabled={bulkEnriching} className="gap-2">
                  <FileText className="h-3.5 w-3.5" /> Generate Summaries
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeduplicateOpen(true)} className="gap-2">
                  <Merge className="h-3.5 w-3.5" /> De-duplicate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Standard
            </Button>
            <span className="text-xs text-muted-foreground hidden sm:inline ml-2">{user.email}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Kanban */}
      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4">
          <StandardsFilterBar
            allTags={allTags}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            allOrganizations={allOrganizations}
            selectedOrganizations={selectedOrgs}
            onOrganizationsChange={setSelectedOrgs}
            searchQuery={adminSearch}
            onSearchChange={setAdminSearch}
            filterNoResources={filterNoResources}
            onFilterNoResourcesChange={setFilterNoResources}
            filterNoSummaries={filterNoSummaries}
            onFilterNoSummariesChange={setFilterNoSummaries}
          />
        </div>
        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load standards.
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-24" />
                {[0, 1, 2].map((j) => <Skeleton key={j} className="h-24 w-full rounded-lg" />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const items = columnStandards(col.status);
              return (
                <div
                  key={col.status}
                  className={cn(
                    "flex flex-col min-h-[400px] rounded-lg border bg-muted/20 p-3 transition-all duration-200",
                    dragOverCol === col.status && "ring-2 ring-primary/40 bg-primary/5"
                  )}
                  onDragOver={(e) => handleDragOver(e, col.status)}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={(e) => handleDrop(e, col.status)}
                >
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <span className="ml-auto text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-3 px-1">{col.description}</p>

                  <div className="space-y-2 flex-1">
                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-background/50 p-6 text-center">
                        <p className="text-xs text-muted-foreground">Drop standards here</p>
                      </div>
                    ) : (
                      items.map((s) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, s.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={cn(
                            "group rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-150",
                            "hover:shadow-md hover:border-primary/20",
                            draggedId === s.id && "opacity-40 scale-95"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="font-medium text-xs text-card-foreground">{s.title}</span>
                                {s.acronym && (
                                  <span className="px-1 py-0.5 text-[9px] font-semibold uppercase rounded bg-primary/10 text-primary">
                                    {s.acronym}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{s.description}</p>
                              {s.tags && s.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {s.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="px-1 py-0.5 text-[9px] rounded bg-muted text-muted-foreground">{tag}</span>
                                  ))}
                                  {s.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{s.tags.length - 3}</span>}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => navigate(`/admin/edit/${s.id}`)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors">
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button onClick={() => handleDelete(s.id)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 transition-colors">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create New Standard Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Standard</DialogTitle>
            <DialogDescription>Create manually or discover from a URL with AI.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4 px-4"
              onClick={() => { setCreateOpen(false); navigate("/admin/edit/new"); }}
            >
              <Plus className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium">Create manually</p>
                <p className="text-xs text-muted-foreground">Fill in the details yourself</p>
              </div>
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Discover with AI</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Paste a URL and AI will extract the standard's metadata.</p>
              <AiIngestion />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DiscoverStandards open={discoverOpen} onOpenChange={setDiscoverOpen} />
      <DeduplicateDialog open={deduplicateOpen} onOpenChange={setDeduplicateOpen} standards={standards || []} />
    </div>
  );
}
