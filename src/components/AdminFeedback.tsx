import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStandards } from "@/hooks/useStandards";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag, Sparkles, Loader2, Check, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StandardFlag {
  id: string;
  standard_id: string;
  user_email: string | null;
  feedback: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface FactCheckResult {
  is_valid: boolean;
  confidence: string;
  reasoning: string;
  suggested_updates: Record<string, any>;
}

function useFlags() {
  return useQuery({
    queryKey: ["standard-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standard_flags")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as StandardFlag[];
    },
  });
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  reviewed: { label: "Reviewed", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  applied: { label: "Applied", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  dismissed: { label: "Dismissed", className: "bg-muted text-muted-foreground" },
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-red-500 dark:text-red-400",
};

export default function AdminFeedback() {
  const { data: flags, isLoading } = useFlags();
  const { data: standards } = useStandards();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [factChecking, setFactChecking] = useState<string | null>(null);
  const [factCheckResults, setFactCheckResults] = useState<Record<string, FactCheckResult>>({});
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const getStandard = (id: string) => standards?.find((s) => s.id === id);

  const handleFactCheck = async (flag: StandardFlag) => {
    setFactChecking(flag.id);
    try {
      const { data, error } = await supabase.functions.invoke("fact-check-standard", {
        body: { standard_id: flag.standard_id, feedback: flag.feedback },
      });
      if (error || !data?.success) {
        toast({ title: "Fact-check failed", description: error?.message ?? data?.error, variant: "destructive" });
      } else {
        setFactCheckResults((prev) => ({ ...prev, [flag.id]: data.data }));
        // Persist result and mark as reviewed
        await supabase.from("standard_flags").update({
          status: "reviewed",
          admin_notes: JSON.stringify(data.data),
        } as any).eq("id", flag.id);
        qc.invalidateQueries({ queryKey: ["standard-flags"] });
      }
    } catch {
      toast({ title: "Error", description: "Failed to fact-check", variant: "destructive" });
    }
    setFactChecking(null);
  };

  const handleApplyUpdates = async (flag: StandardFlag) => {
    const result = factCheckResults[flag.id];
    if (!result?.suggested_updates) return;

    setApplyingId(flag.id);
    const updates = result.suggested_updates;
    const payload: Record<string, any> = {};
    if (updates.title) payload.title = updates.title;
    if (updates.acronym) payload.acronym = updates.acronym;
    if (updates.description) payload.description = updates.description;
    if (updates.organization) payload.organization = updates.organization;
    if (updates.status) payload.status = updates.status;
    if (updates.tags) payload.tags = updates.tags;

    if (Object.keys(payload).length === 0) {
      toast({ title: "No updates to apply" });
      setApplyingId(null);
      return;
    }

    const { error } = await supabase.from("standards").update(payload).eq("id", flag.standard_id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("standard_flags").update({
        status: "applied",
        admin_notes: `AI fact-check applied: ${result.reasoning}`,
      } as any).eq("id", flag.id);
      toast({ title: "Updates applied" });
      qc.invalidateQueries({ queryKey: ["standards"] });
      qc.invalidateQueries({ queryKey: ["standard-flags"] });
    }
    setApplyingId(null);
  };

  const handleDismiss = async (flagId: string) => {
    await supabase.from("standard_flags").update({ status: "dismissed" } as any).eq("id", flagId);
    qc.invalidateQueries({ queryKey: ["standard-flags"] });
    toast({ title: "Flag dismissed" });
  };

  const pendingCount = flags?.filter((f) => f.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Community Feedback</h2>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 tabular-nums">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !flags || flags.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Flag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No community feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => {
            const standard = getStandard(flag.standard_id);
            const badge = STATUS_BADGE[flag.status] || STATUS_BADGE.pending;
            const isExpanded = expandedId === flag.id;
            const result = factCheckResults[flag.id];

            return (
              <div key={flag.id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : flag.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <Flag className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {standard?.title || "Unknown Standard"}
                      </span>
                      <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded-full", badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{flag.feedback}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {new Date(flag.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Feedback details */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Feedback</p>
                      <p className="text-sm text-foreground bg-muted/30 rounded-md p-3 leading-relaxed">{flag.feedback}</p>
                      {flag.user_email && (
                        <p className="text-xs text-muted-foreground">From: {flag.user_email}</p>
                      )}
                    </div>

                    {/* Fact check result */}
                    {result && (
                      <div className="rounded-lg border bg-background p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold">AI Fact-Check</span>
                          <span className={cn("text-xs font-medium", CONFIDENCE_BADGE[result.confidence] || "")}>
                            {result.confidence} confidence
                          </span>
                          {result.is_valid ? (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                              <Check className="h-3 w-3" /> Valid
                            </span>
                          ) : (
                            <span className="text-xs text-red-500 font-medium flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> Questionable
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed">{result.reasoning}</p>

                        {Object.keys(result.suggested_updates).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] uppercase tracking-wider font-medium text-primary">Suggested Updates</p>
                            {Object.entries(result.suggested_updates).map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2 text-sm">
                                <span className="font-medium text-foreground capitalize shrink-0 w-24">{key}:</span>
                                <span className="text-muted-foreground">
                                  {Array.isArray(value) ? value.join(", ") : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {flag.status === "pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleFactCheck(flag)}
                          disabled={factChecking === flag.id}
                          className="gap-1.5"
                        >
                          {factChecking === flag.id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
                          ) : (
                            <><Sparkles className="h-3.5 w-3.5" /> AI Fact-Check</>
                          )}
                        </Button>
                      )}
                      {result && Object.keys(result.suggested_updates).length > 0 && flag.status !== "applied" && (
                        <Button
                          size="sm"
                          onClick={() => handleApplyUpdates(flag)}
                          disabled={applyingId === flag.id}
                          className="gap-1.5"
                        >
                          {applyingId === flag.id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
                          ) : (
                            <><Check className="h-3.5 w-3.5" /> Apply Updates</>
                          )}
                        </Button>
                      )}
                      {flag.status !== "dismissed" && flag.status !== "applied" && (
                        <Button size="sm" variant="ghost" onClick={() => handleDismiss(flag.id)} className="gap-1.5 text-muted-foreground">
                          <X className="h-3.5 w-3.5" /> Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
