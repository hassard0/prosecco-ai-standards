import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Check, Loader2, ArrowLeftRight } from "lucide-react";
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

type Step = "pick" | "compare";

export function DeduplicateDialog({ open, onOpenChange, standards }: DeduplicateDialogProps) {
  const [step, setStep] = useState<Step>("pick");
  const [standardA, setStandardA] = useState<Standard | null>(null);
  const [standardB, setStandardB] = useState<Standard | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [chosen, setChosen] = useState<Record<FieldKey, "a" | "b" | "merge">>({} as any);
  const [merging, setMerging] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => {
    setStep("pick");
    setStandardA(null);
    setStandardB(null);
    setSearchA("");
    setSearchB("");
    setChosen({} as any);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const filteredA = useMemo(() => {
    const q = searchA.toLowerCase();
    return standards.filter((s) => {
      if (standardB && s.id === standardB.id) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || (s.acronym?.toLowerCase().includes(q));
    });
  }, [standards, searchA, standardB]);

  const filteredB = useMemo(() => {
    const q = searchB.toLowerCase();
    return standards.filter((s) => {
      if (standardA && s.id === standardA.id) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || (s.acronym?.toLowerCase().includes(q));
    });
  }, [standards, searchB, standardA]);

  const handleSwap = useCallback(() => {
    setStandardA(standardB);
    setStandardB(standardA);
    // Flip all chosen sides
    setChosen((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as FieldKey[]) {
        if (next[key] === "a") next[key] = "b";
        else if (next[key] === "b") next[key] = "a";
      }
      return next;
    });
  }, [standardA, standardB]);

  const startCompare = () => {
    if (!standardA || !standardB) return;
    const initial: Record<string, "a" | "b" | "merge"> = {};
    for (const f of FIELDS) {
      initial[f.key] = "a"; // default keep A
    }
    setChosen(initial as Record<FieldKey, "a" | "b" | "merge">);
    setStep("compare");
  };

  const getFieldValue = (s: Standard, key: FieldKey): any => {
    return (s as any)[key];
  };

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
    // merge: combine arrays/text
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
    for (const f of FIELDS) {
      payload[f.key] = mergeField(f.key);
    }

    // Update standard A with merged data
    const { error: updateError } = await supabase
      .from("standards")
      .update(payload)
      .eq("id", standardA.id);

    if (updateError) {
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
      setMerging(false);
      return;
    }

    // Update any references: move summaries from B to A
    await supabase
      .from("standard_summaries")
      .update({ standard_id: standardA.id } as any)
      .eq("standard_id", standardB.id);

    // Move flags from B to A
    await supabase
      .from("standard_flags")
      .update({ standard_id: standardA.id } as any)
      .eq("standard_id", standardB.id);

    // Delete standard B
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
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn("max-h-[90vh] flex flex-col", step === "compare" ? "sm:max-w-4xl" : "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{step === "pick" ? "De-duplicate Standards" : "Compare & Merge"}</DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? "Select two standards that are duplicates to compare and merge."
              : "Choose which value to keep for each field. The second standard will be deleted."}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Pick A */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Standard A (will be kept)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search…" value={searchA} onChange={(e) => setSearchA(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <ScrollArea className="h-56 rounded-md border">
                <div className="p-1">
                  {filteredA.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStandardA(s)}
                      className={cn(
                        "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors",
                        standardA?.id === s.id && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <span className="line-clamp-1">{s.title}</span>
                      {s.acronym && <span className="text-muted-foreground ml-1">({s.acronym})</span>}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              {standardA && (
                <Badge variant="secondary" className="text-[10px]">
                  <Check className="h-3 w-3 mr-1" /> {standardA.title}
                </Badge>
              )}
            </div>

            {/* Pick B */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Standard B (will be removed)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search…" value={searchB} onChange={(e) => setSearchB(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <ScrollArea className="h-56 rounded-md border">
                <div className="p-1">
                  {filteredB.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStandardB(s)}
                      className={cn(
                        "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors",
                        standardB?.id === s.id && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <span className="line-clamp-1">{s.title}</span>
                      {s.acronym && <span className="text-muted-foreground ml-1">({s.acronym})</span>}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              {standardB && (
                <Badge variant="secondary" className="text-[10px]">
                  <Check className="h-3 w-3 mr-1" /> {standardB.title}
                </Badge>
              )}
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <Button size="sm" onClick={startCompare} disabled={!standardA || !standardB} className="gap-1.5">
                Compare <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === "compare" && standardA && standardB && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 pt-2">
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {/* Header row */}
                <div className="grid grid-cols-[120px_1fr_40px_1fr] gap-2 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background z-10 border-b">
                  <span>Field</span>
                  <span>A — Keep</span>
                  <span />
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

                      {/* Value A */}
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

                      {/* Merge button */}
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

                      {/* Value B */}
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
              <Button variant="outline" size="sm" onClick={() => setStep("pick")}>
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
