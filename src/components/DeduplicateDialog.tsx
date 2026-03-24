import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Check, Loader2, ArrowLeftRight, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Standard } from "@/hooks/useStandards";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface DeduplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standards: Standard[];
}

type FieldKey = "title" | "acronym" | "description" | "status" | "link" | "organization" | "tags" | "resources" | "authors" | "is_expired";

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "acronym", label: "Acronym" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "organization", label: "Organization" },
  { key: "link", label: "Specification URL" },
  { key: "tags", label: "Tags" },
  { key: "resources", label: "Resources" },
  { key: "authors", label: "Authors" },
  { key: "is_expired", label: "Expired" },
];

type RelatedEntry = {
  id: string;
  title: string;
  relationship: string;
  confidence: string;
  reason: string;
};

type Cluster = {
  canonical_id: string;
  canonical_title: string;
  related: RelatedEntry[];
  notes?: string;
};

type ScanResult = {
  clusters: Cluster[];
  summary: string;
};

type Step = "scan" | "clusters" | "compare";

const RELATIONSHIP_COLORS: Record<string, string> = {
  true_duplicate: "bg-destructive/10 text-destructive border-destructive/30",
  alias: "bg-primary/10 text-primary border-primary/30",
  editor_copy: "bg-accent text-accent-foreground border-accent",
  replaced_by: "bg-muted text-muted-foreground border-border",
  merged_into: "bg-muted text-muted-foreground border-border",
  acronym_collision: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
};

const CONFIDENCE_ICONS: Record<string, string> = {
  high: "●",
  medium: "◐",
  low: "○",
};

export function DeduplicateDialog({ open, onOpenChange, standards }: DeduplicateDialogProps) {
  const [step, setStep] = useState<Step>("scan");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Compare step state
  const [standardA, setStandardA] = useState<Standard | null>(null);
  const [standardB, setStandardB] = useState<Standard | null>(null);
  const [chosen, setChosen] = useState<Record<FieldKey, "a" | "b" | "merge">>({} as any);
  const [merging, setMerging] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => {
    setStep("scan");
    setScanning(false);
    setScanResult(null);
    setScanError(null);
    setStandardA(null);
    setStandardB(null);
    setChosen({} as any);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // --- Scan step ---
  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const { data, error } = await supabase.functions.invoke("dedupe-standards", {
        body: { standards },
      });
      if (error) throw new Error(error.message || "Scan failed");
      if (data?.error) throw new Error(data.error);
      setScanResult(data as ScanResult);
      setStep("clusters");
    } catch (e: any) {
      setScanError(e.message || "Unknown error");
    } finally {
      setScanning(false);
    }
  };

  // --- Cluster drill-down ---
  const drillIntoCluster = (cluster: Cluster, relatedId: string) => {
    const canonical = standards.find((s) => s.id === cluster.canonical_id);
    const related = standards.find((s) => s.id === relatedId);
    if (!canonical || !related) {
      toast({ title: "Error", description: "Could not find one of the standards.", variant: "destructive" });
      return;
    }
    setStandardA(canonical);
    setStandardB(related);
    const initial: Record<string, "a" | "b" | "merge"> = {};
    for (const f of FIELDS) initial[f.key] = "a";
    setChosen(initial as Record<FieldKey, "a" | "b" | "merge">);
    setStep("compare");
  };

  // --- Compare helpers (same as before) ---
  const handleSwap = useCallback(() => {
    setStandardA(standardB);
    setStandardB(standardA);
    setChosen((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as FieldKey[]) {
        if (next[key] === "a") next[key] = "b";
        else if (next[key] === "b") next[key] = "a";
      }
      return next;
    });
  }, [standardA, standardB]);

  const getFieldValue = (s: Standard, key: FieldKey): any => (s as any)[key];

  const renderValue = (val: any, key: FieldKey): string => {
    if (val === null || val === undefined) return "—";
    if (key === "tags" && Array.isArray(val)) return val.join(", ") || "—";
    if (key === "resources" && Array.isArray(val)) return `${val.length} resource(s)`;
    if (key === "authors" && Array.isArray(val)) return val.map((a: any) => a.name).join(", ") || "—";
    if (key === "is_expired") return val ? "Expired" : "Active";
    if (typeof val === "string") return val || "—";
    return String(val);
  };

  const mergeField = (key: FieldKey): any => {
    const side = chosen[key];
    const a = getFieldValue(standardA!, key);
    const b = getFieldValue(standardB!, key);
    if (side === "a") return a;
    if (side === "b") return b;
    if (key === "tags") return [...new Set([...(a || []), ...(b || [])])];
    if (key === "resources") return [...(a || []), ...(b || [])];
    if (key === "authors") return [...(a || []), ...(b || [])];
    if (key === "description") return [a, b].filter(Boolean).join("\n\n");
    return a || b;
  };

  const handleMerge = async () => {
    if (!standardA || !standardB) return;
    setMerging(true);

    const payload: Record<string, any> = {};
    for (const f of FIELDS) payload[f.key] = mergeField(f.key);

    const { error: updateError } = await supabase
      .from("standards")
      .update(payload)
      .eq("id", standardA.id);

    if (updateError) {
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
      setMerging(false);
      return;
    }

    await supabase
      .from("standard_summaries")
      .update({ standard_id: standardA.id } as any)
      .eq("standard_id", standardB.id);

    await supabase
      .from("standard_flags")
      .update({ standard_id: standardA.id } as any)
      .eq("standard_id", standardB.id);

    const { error: deleteError } = await supabase
      .from("standards")
      .delete()
      .eq("id", standardB.id);

    if (deleteError) {
      toast({ title: "Merge partial", description: `Merged fields but failed to delete duplicate: ${deleteError.message}`, variant: "destructive" });
    } else {
      toast({ title: "Standards merged", description: `"${payload.title}" kept, duplicate removed.` });
    }

    qc.invalidateQueries({ queryKey: ["standards"] });
    setMerging(false);
    // Go back to clusters if we have results, otherwise close
    if (scanResult && scanResult.clusters.length > 1) {
      // Remove the merged cluster from results
      setScanResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clusters: prev.clusters.map((c) => ({
            ...c,
            related: c.related.filter((r) => r.id !== standardB.id),
          })).filter((c) => c.related.length > 0),
        };
      });
      setStep("clusters");
    } else {
      handleOpenChange(false);
    }
  };

  const dialogWidth = step === "compare" ? "sm:max-w-4xl" : step === "clusters" ? "sm:max-w-3xl" : "sm:max-w-lg";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn("max-h-[90vh] flex flex-col min-h-0", dialogWidth)}>
        <DialogHeader>
          <DialogTitle>
            {step === "scan" && "De-duplicate Standards"}
            {step === "clusters" && "Detected Clusters"}
            {step === "compare" && "Compare & Merge"}
          </DialogTitle>
          <DialogDescription>
            {step === "scan" && "AI will analyze your inventory to detect duplicates, aliases, and collisions."}
            {step === "clusters" && scanResult?.summary}
            {step === "compare" && "Choose which value to keep for each field. The second standard will be deleted."}
          </DialogDescription>
        </DialogHeader>

        {/* SCAN STEP */}
        {step === "scan" && (
          <div className="flex flex-col items-center gap-4 py-8">
            {scanError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Scans {standards.length} standards for true duplicates, aliases, editor copies, successor gaps, and acronym collisions.
            </p>
            <Button onClick={runScan} disabled={scanning} className="gap-2">
              {scanning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Run AI Scan</>
              )}
            </Button>
          </div>
        )}

        {/* CLUSTERS STEP */}
        {step === "clusters" && scanResult && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 pt-1 min-h-0">
            {scanResult.clusters.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Check className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">No duplicates detected</p>
                <p className="text-xs text-muted-foreground">Your inventory looks clean.</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-3 pr-2">
                  {scanResult.clusters.map((cluster, ci) => (
                    <div key={ci} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">Canonical:</span>
                        <span className="text-xs font-medium">{cluster.canonical_title}</span>
                      </div>
                      {cluster.notes && (
                        <p className="text-[11px] text-muted-foreground">{cluster.notes}</p>
                      )}
                      <div className="space-y-1.5">
                        {cluster.related.map((rel) => (
                          <div
                            key={rel.id}
                            className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium truncate">{rel.title}</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1.5 py-0",
                                    RELATIONSHIP_COLORS[rel.relationship] || ""
                                  )}
                                >
                                  {rel.relationship.replace(/_/g, " ")}
                                </Badge>
                                <span
                                  className="text-[10px] text-muted-foreground"
                                  title={`Confidence: ${rel.confidence}`}
                                >
                                  {CONFIDENCE_ICONS[rel.confidence] || "○"} {rel.confidence}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-1">{rel.reason}</p>
                            </div>
                            {rel.relationship !== "acronym_collision" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 h-7 text-[10px] gap-1"
                                onClick={() => drillIntoCluster(cluster, rel.id)}
                              >
                                Merge <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <div className="flex items-center justify-between border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => { setScanResult(null); setStep("scan"); }}>
                Re-scan
              </Button>
            </div>
          </div>
        )}

        {/* COMPARE STEP */}
        {step === "compare" && standardA && standardB && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 pt-2">
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                <div className="grid grid-cols-[120px_1fr_40px_1fr] gap-2 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background z-10 border-b">
                  <span>Field</span>
                  <span>A — Keep</span>
                  <button
                    onClick={handleSwap}
                    className="flex items-center justify-center hover:text-primary transition-colors"
                    title="Swap A and B"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                  <span>B — Remove</span>
                </div>

                {FIELDS.map((f) => {
                  const valA = renderValue(getFieldValue(standardA, f.key), f.key);
                  const valB = renderValue(getFieldValue(standardB, f.key), f.key);
                  const isDiff = valA !== valB;
                  const pick = chosen[f.key];
                  const canMerge = ["tags", "resources", "authors", "description"].includes(f.key);

                  return (
                    <div
                      key={f.key}
                      className={cn(
                        "grid grid-cols-[120px_1fr_40px_1fr] gap-2 px-2 py-2 rounded-md text-xs items-start",
                        isDiff ? "bg-muted/30" : ""
                      )}
                    >
                      <span className="font-medium text-foreground pt-0.5">{f.label}</span>
                      <button
                        onClick={() => setChosen((p) => ({ ...p, [f.key]: "a" }))}
                        className={cn(
                          "text-left rounded-md border p-2 transition-all text-xs leading-relaxed",
                          pick === "a"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <span className="line-clamp-4 break-words">{valA}</span>
                      </button>
                      <div className="flex items-center justify-center pt-1">
                        {canMerge && (
                          <button
                            onClick={() => setChosen((p) => ({ ...p, [f.key]: pick === "merge" ? "a" : "merge" }))}
                            className={cn(
                              "text-[9px] font-semibold px-1.5 py-1 rounded transition-colors",
                              pick === "merge"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                            )}
                            title="Merge both values"
                          >
                            Both
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setChosen((p) => ({ ...p, [f.key]: "b" }))}
                        className={cn(
                          "text-left rounded-md border p-2 transition-all text-xs leading-relaxed",
                          pick === "b"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <span className="line-clamp-4 break-words">{valB}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(scanResult ? "clusters" : "scan")}
              >
                Back
              </Button>
              <Button size="sm" onClick={handleMerge} disabled={merging} className="gap-1.5">
                {merging ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Merging…</>
                ) : (
                  "Merge & Delete Duplicate"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
