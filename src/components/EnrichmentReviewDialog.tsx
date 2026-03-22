import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import type { ResourceLink } from "@/components/ResourceLinksEditor";
import { RESOURCE_TYPES } from "@/components/ResourceLinksEditor";
import type { Author } from "@/components/AuthorsEditor";

interface EnrichmentData {
  title?: string;
  acronym?: string;
  description?: string;
  organization?: string;
  status?: string;
  tags?: string[];
  link?: string;
  resources?: ResourceLink[];
  authors?: Author[];
}

interface CurrentData {
  title: string;
  acronym: string;
  description: string;
  organization: string;
  status: string;
  tags: string[];
  link: string;
  resources: ResourceLink[];
  authors: Author[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: CurrentData;
  proposed: EnrichmentData;
  onAccept: (accepted: Record<string, boolean>) => void;
}

type FieldKey = "title" | "acronym" | "description" | "organization" | "tags" | "resources" | "authors";

const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  acronym: "Acronym",
  description: "Description",
  organization: "Organization",
  tags: "Tags",
  resources: "Resources",
  authors: "Authors & Affiliations",
};

export function EnrichmentReviewDialog({ open, onOpenChange, current, proposed, onAccept }: Props) {
  const changedFields: FieldKey[] = [];
  if (proposed.title && proposed.title !== current.title) changedFields.push("title");
  if (proposed.acronym && proposed.acronym !== current.acronym) changedFields.push("acronym");
  if (proposed.description && proposed.description !== current.description) changedFields.push("description");
  if (proposed.organization && proposed.organization !== current.organization) changedFields.push("organization");
  if (proposed.tags && proposed.tags.length > 0) changedFields.push("tags");
  if (proposed.resources && proposed.resources.length > 0) changedFields.push("resources");
  if (proposed.authors && proposed.authors.length > 0) changedFields.push("authors");

  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setAccepted(Object.fromEntries(changedFields.map((f) => [f, true])));
    }
  }, [open, proposed, current]);

  const toggle = (field: string) => setAccepted((prev) => ({ ...prev, [field]: !prev[field] }));
  const acceptAll = () => setAccepted(Object.fromEntries(changedFields.map((f) => [f, true])));

  const getCurrentValue = (field: FieldKey): string => {
    if (field === "tags") return current.tags.length > 0 ? current.tags.join(", ") : "—";
    if (field === "resources") return current.resources.length > 0
      ? current.resources.map((r) => `${r.label || r.url}`).join(", ")
      : "—";
    if (field === "authors") return current.authors.length > 0
      ? current.authors.map((a) => `${a.name} (${a.company})`).join(", ")
      : "—";
    return (current as any)[field] || "—";
  };

  const getProposedValue = (field: FieldKey): string => {
    if (field === "tags") {
      const merged = [...new Set([...current.tags, ...(proposed.tags || [])])];
      return merged.join(", ");
    }
    if (field === "resources") return (proposed.resources || []).map((r) => r.label || r.url).join(", ");
    if (field === "authors") return (proposed.authors || []).map((a) => `${a.name} (${a.company})`).join(", ");
    return String((proposed as any)[field] || "—");
  };

  const isListField = (field: FieldKey) => field === "resources" || field === "authors";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Review AI Enrichment</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select which fields to update with the AI-suggested content.
          </p>
        </DialogHeader>

        {changedFields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No new information found to enrich.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {changedFields.map((field) => (
              <div
                key={field}
                className={`rounded-lg border p-4 transition-all duration-200 cursor-pointer ${
                  accepted[field]
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-background opacity-60"
                }`}
                onClick={() => toggle(field)}
              >
                <div className="flex items-start gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={accepted[field]}
                      onCheckedChange={(checked) => setAccepted((prev) => ({ ...prev, [field]: checked === true }))}
                      className="mt-0.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <Label className="text-sm font-semibold">{FIELD_LABELS[field]}</Label>

                    {isListField(field) ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-medium text-primary">
                          {field === "authors" ? "Authors to add" : "New resources to add"}
                        </p>
                        <div className="space-y-1">
                          {field === "authors" && (proposed.authors || []).map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm bg-primary/5 rounded p-2">
                              <span className="font-medium text-foreground">{a.name}</span>
                              <span className="text-muted-foreground">—</span>
                              <span className="text-foreground">{a.company}</span>
                              {a.role && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">({a.role})</span>}
                            </div>
                          ))}
                          {field === "resources" && (proposed.resources || []).map((r, i) => {
                            const typeLabel = RESOURCE_TYPES.find((t) => t.value === r.type)?.label || r.type;
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm bg-primary/5 rounded p-2">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0">{typeLabel}</span>
                                <span className="text-foreground truncate">{r.label || r.url}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Current</p>
                          <p className="text-sm text-muted-foreground bg-muted/40 rounded p-2 break-words whitespace-pre-wrap">
                            {getCurrentValue(field)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider font-medium text-primary">Proposed</p>
                          <p className="text-sm text-foreground bg-primary/5 rounded p-2 break-words whitespace-pre-wrap">
                            {getProposedValue(field)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Button variant="ghost" size="sm" onClick={acceptAll}>
            <Check className="h-3.5 w-3.5 mr-1" /> Select All
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onAccept(accepted)}
              disabled={!Object.values(accepted).some(Boolean)}
            >
              Apply Selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
