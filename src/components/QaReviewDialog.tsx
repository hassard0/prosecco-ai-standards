import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink } from "lucide-react";
import type { Author } from "@/components/AuthorsEditor";

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  type: string;
}

export interface QaResults {
  summary: string;
  citations?: string[];
  current: {
    organization: string;
    authors: Author[];
    timeline_events: TimelineEvent[];
    description: string;
    link: string;
  };
  organization?: {
    current: string;
    suggested: string;
    reason: string;
  };
  authors?: {
    suggested: Author[];
    reason: string;
  };
  timeline_events?: {
    suggested: TimelineEvent[];
    reason: string;
  };
  description?: {
    suggested: string;
    reason: string;
  };
  link?: {
    suggested: string;
    suggested_label?: string;
    reason: string;
  };
}

type QaField = "organization" | "authors" | "timeline_events" | "description" | "link";

const FIELD_LABELS: Record<QaField, string> = {
  organization: "Organization",
  authors: "Authors & Affiliations",
  timeline_events: "Timeline Events",
  description: "Description",
  link: "Primary Specification Link",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: QaResults;
  onApply: (accepted: Record<QaField, boolean>) => void;
}

export function QaReviewDialog({ open, onOpenChange, results, onApply }: Props) {
  const fields: QaField[] = [];
  if (results.organization?.suggested) fields.push("organization");
  if (results.authors?.suggested?.length) fields.push("authors");
  if (results.timeline_events?.suggested?.length) fields.push("timeline_events");
  if (results.description?.suggested) fields.push("description");
  if (results.link?.suggested) fields.push("link");

  const [accepted, setAccepted] = useState<Record<string, boolean>>(
    Object.fromEntries(fields.map((f) => [f, true]))
  );

  const toggle = (field: string) =>
    setAccepted((prev) => ({ ...prev, [field]: !prev[field] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">QA Review</DialogTitle>
          <p className="text-sm text-muted-foreground">{results.summary}</p>
        </DialogHeader>

        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No corrections needed — everything looks accurate!
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {fields.map((field) => (
              <FieldDiff
                key={field}
                field={field}
                results={results}
                checked={!!accepted[field]}
                onToggle={() => toggle(field)}
              />
            ))}
          </div>
        )}

        {/* Citations */}
        {results.citations && results.citations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Sources
            </p>
            <div className="flex flex-wrap gap-1.5">
              {results.citations.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {new URL(url).hostname}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setAccepted(Object.fromEntries(fields.map((f) => [f, true])))
            }
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Select All
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onApply(accepted as Record<QaField, boolean>)}
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

function FieldDiff({
  field,
  results,
  checked,
  onToggle,
}: {
  field: QaField;
  results: QaResults;
  checked: boolean;
  onToggle: () => void;
}) {
  const reason =
    field === "organization"
      ? results.organization?.reason
      : field === "authors"
      ? results.authors?.reason
      : field === "timeline_events"
      ? results.timeline_events?.reason
      : field === "link"
      ? results.link?.reason
      : results.description?.reason;

  return (
    <div
      className={`rounded-lg border p-4 transition-all duration-200 cursor-pointer ${
        checked
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background opacity-60"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={checked}
            onCheckedChange={() => onToggle()}
            className="mt-0.5"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{FIELD_LABELS[field]}</span>
            {reason && (
              <span className="text-[11px] text-muted-foreground italic">
                — {reason}
              </span>
            )}
          </div>

          {field === "organization" && results.organization && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DiffBlock label="Current" value={results.current.organization || "—"} variant="old" />
              <DiffBlock label="Suggested" value={results.organization.suggested} variant="new" />
            </div>
          )}

          {field === "description" && results.description && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DiffBlock label="Current" value={results.current.description} variant="old" />
              <DiffBlock label="Suggested" value={results.description.suggested} variant="new" />
            </div>
          )}

          {field === "link" && results.link && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DiffBlock label="Current Primary Link" value={results.current.link || "—"} variant="old" />
                <DiffBlock label="Suggested Primary Link" value={results.link.suggested} variant="new" />
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                The current link will be moved to resources{results.link.suggested_label ? ` as "${results.link.suggested_label}"` : ""}.
              </p>
            </div>
          )}

          {field === "authors" && results.authors && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  Current ({results.current.authors.length})
                </p>
                <div className="space-y-1">
                  {results.current.authors.length === 0 && (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded p-2">—</p>
                  )}
                  {results.current.authors.map((a, i) => (
                    <AuthorPill key={i} author={a} variant="old" />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-medium text-primary">
                  Suggested ({results.authors.suggested.length})
                </p>
                <div className="space-y-1">
                  {results.authors.suggested.map((a, i) => (
                    <AuthorPill key={i} author={a} variant="new" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {field === "timeline_events" && results.timeline_events && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  Current ({results.current.timeline_events.length})
                </p>
                <div className="space-y-1">
                  {results.current.timeline_events.length === 0 && (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded p-2">—</p>
                  )}
                  {results.current.timeline_events.map((e, i) => (
                    <EventPill key={i} event={e} variant="old" />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-medium text-primary">
                  Suggested ({results.timeline_events.suggested.length})
                </p>
                <div className="space-y-1">
                  {results.timeline_events.suggested.map((e, i) => (
                    <EventPill key={i} event={e} variant="new" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffBlock({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "old" | "new";
}) {
  return (
    <div className="space-y-1">
      <p
        className={`text-[10px] uppercase tracking-wider font-medium ${
          variant === "new" ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-sm rounded p-2 break-words whitespace-pre-wrap ${
          variant === "new"
            ? "text-foreground bg-primary/5"
            : "text-muted-foreground bg-muted/40"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function AuthorPill({
  author,
  variant,
}: {
  author: Author;
  variant: "old" | "new";
}) {
  return (
    <div
      className={`flex items-center gap-2 text-sm rounded p-2 ${
        variant === "new" ? "bg-primary/5" : "bg-muted/40"
      }`}
    >
      <span className="font-medium text-foreground">{author.name}</span>
      <span className="text-muted-foreground">—</span>
      <span className="text-foreground">{author.company}</span>
      {author.role && (
        <Badge variant="outline" className="text-[10px] h-4">
          {author.role}
        </Badge>
      )}
    </div>
  );
}

function EventPill({
  event,
  variant,
}: {
  event: TimelineEvent;
  variant: "old" | "new";
}) {
  return (
    <div
      className={`flex items-start gap-2 text-sm rounded p-2 ${
        variant === "new" ? "bg-primary/5" : "bg-muted/40"
      }`}
    >
      <Badge variant="outline" className="text-[10px] h-4 shrink-0">
        {event.type}
      </Badge>
      <div className="min-w-0">
        <span className="font-medium">{event.title}</span>
        <span className="text-muted-foreground ml-1.5 text-xs">{event.date}</span>
      </div>
    </div>
  );
}
