import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, ChevronRight, Import, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ORGANIZATIONS = [
  { id: "ietf", name: "IETF", desc: "Internet Engineering Task Force" },
  { id: "linux-foundation", name: "Linux Foundation", desc: "Open-source projects & AI initiatives" },
  { id: "fido-alliance", name: "FIDO Alliance", desc: "Authentication & identity standards" },
  { id: "cncf", name: "CNCF", desc: "Cloud Native Computing Foundation" },
  { id: "openid", name: "OpenID Foundation", desc: "Identity & authentication specs" },
  { id: "w3c", name: "W3C", desc: "World Wide Web Consortium" },
  { id: "oasis", name: "OASIS", desc: "Open standards for information society" },
  { id: "nist", name: "NIST", desc: "National Institute of Standards & Technology" },
  { id: "ieee", name: "IEEE", desc: "Electrical & electronics engineering standards" },
  { id: "iso", name: "ISO/IEC", desc: "International standards organization" },
];

interface DiscoveredStandard {
  title: string;
  acronym?: string;
  description: string;
  organization: string;
  link?: string;
  tags?: string[];
}

type Step = "pick-orgs" | "scanning" | "results";

export function DiscoverStandards({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("pick-orgs");
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveredStandard[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const toggleOrg = (id: string) =>
    setSelectedOrgs((prev) => (prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]));

  const toggleResult = (idx: number) =>
    setSelectedResults((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const toggleAllResults = () => {
    if (selectedResults.size === results.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(results.map((_, i) => i)));
    }
  };

  const handleScan = async () => {
    if (selectedOrgs.length === 0) return;
    setStep("scanning");
    setResults([]);
    setSelectedResults(new Set());

    const orgNames = selectedOrgs.map((id) => ORGANIZATIONS.find((o) => o.id === id)?.name || id);

    try {
      const { data, error } = await supabase.functions.invoke("discover-standards", {
        body: { organizations: orgNames },
      });

      if (error || !data?.success) {
        toast({
          title: "Discovery failed",
          description: error?.message || data?.error || "Unknown error",
          variant: "destructive",
        });
        setStep("pick-orgs");
        return;
      }

      setResults(data.standards || []);
      setStep("results");
    } catch {
      toast({ title: "Error", description: "Failed to discover standards", variant: "destructive" });
      setStep("pick-orgs");
    }
  };

  const handleImport = async () => {
    const toImport = results.filter((_, i) => selectedResults.has(i));
    if (toImport.length === 0) return;

    setImporting(true);
    const payloads = toImport.map((s) => ({
      title: s.title,
      acronym: s.acronym || null,
      description: s.description,
      organization: s.organization || null,
      link: s.link || null,
      tags: s.tags || [],
      status: "Backlog" as const,
    }));

    const { error } = await supabase.from("standards").insert(payloads);
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Imported ${toImport.length} standard${toImport.length > 1 ? "s" : ""} to Backlog` });
      qc.invalidateQueries({ queryKey: ["standards"] });
      onOpenChange(false);
      // Reset for next time
      setTimeout(() => {
        setStep("pick-orgs");
        setSelectedOrgs([]);
        setResults([]);
        setSelectedResults(new Set());
      }, 300);
    }
    setImporting(false);
  };

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setStep("pick-orgs");
        setResults([]);
        setSelectedResults(new Set());
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            {step === "pick-orgs" && "Discover Standards"}
            {step === "scanning" && "Scanning Organizations…"}
            {step === "results" && `Found ${results.length} Standard${results.length !== 1 ? "s" : ""}`}
          </DialogTitle>
          <DialogDescription>
            {step === "pick-orgs" && "Select organizations to scan for AI/ML/Agent standards."}
            {step === "scanning" && "AI is searching for relevant standards…"}
            {step === "results" && "Select which standards to import to your Backlog."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Pick orgs */}
        {step === "pick-orgs" && (
          <>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 py-2">
              {ORGANIZATIONS.map((org) => {
                const selected = selectedOrgs.includes(org.id);
                return (
                  <button
                    key={org.id}
                    onClick={() => toggleOrg(org.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.98]",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    <Checkbox checked={selected} className="mt-0.5 pointer-events-none" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{org.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{org.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              onClick={handleScan}
              disabled={selectedOrgs.length === 0}
              className="w-full gap-2"
            >
              <Search className="h-4 w-4" />
              Scan {selectedOrgs.length} Organization{selectedOrgs.length !== 1 ? "s" : ""}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Step 2: Scanning */}
        {step === "scanning" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Searching for AI/ML/Agent standards…</p>
            <div className="space-y-2 w-full max-w-sm">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === "results" && (
          <>
            {results.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                <p className="text-sm text-muted-foreground">No new standards found. Try different organizations.</p>
                <Button variant="outline" size="sm" onClick={() => setStep("pick-orgs")}>
                  Go Back
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1 pb-1">
                  <button
                    onClick={toggleAllResults}
                    className="text-xs text-primary hover:underline underline-offset-2"
                  >
                    {selectedResults.size === results.length ? "Deselect all" : "Select all"}
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selectedResults.size} selected
                  </span>
                </div>

                <div className="overflow-y-auto flex-1 space-y-1.5 -mx-1 px-1">
                  {results.map((s, idx) => {
                    const checked = selectedResults.has(idx);
                    return (
                      <div
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleResult(idx); } }}
                        onClick={() => toggleResult(idx)}
                        className={cn(
                          "flex items-start gap-3 w-full text-left rounded-lg border p-3 transition-all duration-150 active:scale-[0.98]",
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:border-primary/20 hover:bg-muted/20"
                        )}
                      >
                        <Checkbox checked={checked} className="mt-0.5 pointer-events-none shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="text-sm font-medium text-foreground">{s.title}</span>
                              {s.acronym && (
                                <span className="px-1 py-0.5 text-[9px] font-semibold uppercase rounded bg-primary/10 text-primary">
                                  {s.acronym}
                                </span>
                              )}
                            </div>

                            {s.link ? (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(s.link, "_blank", "noopener,noreferrer");
                                }}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                                aria-label={`Open specification for ${s.title}`}
                              >
                                Spec
                                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                              </button>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                No verified spec link
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{s.description}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{s.organization}</span>
                            {s.tags && s.tags.length > 0 && (
                              <div className="flex gap-1">
                                {s.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="px-1 py-0.5 text-[9px] rounded bg-muted text-muted-foreground">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("pick-orgs")} className="flex-1">
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={selectedResults.size === 0 || importing}
                    className="flex-[2] gap-2"
                  >
                    {importing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                    ) : (
                      <><Import className="h-4 w-4" /> Import {selectedResults.size} to Backlog</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
