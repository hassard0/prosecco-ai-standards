import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Rocket, FileText, Users, Flag, Clock, Star, Circle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import type { Standard } from "@/hooks/useStandards";

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  type: "release" | "draft" | "decision" | "meeting" | "deadline" | "milestone" | "other";
}

interface EnrichedEvent extends TimelineEvent {
  standardId: string;
  standardTitle: string;
  standardAcronym: string | null;
}

const TYPE_CONFIG: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  release: { icon: Rocket, color: "hsl(152 60% 32%)", bg: "hsl(152 60% 42% / 0.12)" },
  draft: { icon: FileText, color: "hsl(220 60% 45%)", bg: "hsl(220 60% 55% / 0.12)" },
  decision: { icon: Flag, color: "hsl(38 80% 40%)", bg: "hsl(38 80% 55% / 0.12)" },
  meeting: { icon: Users, color: "hsl(270 40% 40%)", bg: "hsl(270 40% 55% / 0.12)" },
  deadline: { icon: Clock, color: "hsl(0 60% 45%)", bg: "hsl(0 60% 50% / 0.12)" },
  milestone: { icon: Star, color: "hsl(200 60% 40%)", bg: "hsl(200 60% 50% / 0.12)" },
  other: { icon: Circle, color: "hsl(0 0% 45%)", bg: "hsl(0 0% 50% / 0.12)" },
};

function parseDate(dateStr: string): Date {
  if (/^\d{4}$/.test(dateStr)) return new Date(`${dateStr}-01-01`);
  if (/^\d{4}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}-01`);
  return new Date(dateStr);
}

function formatDate(dateStr: string) {
  try {
    if (/^\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return new Date(dateStr + "-01").toLocaleDateString("en-US", { year: "numeric", month: "short" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function groupByStandard(events: EnrichedEvent[]): { id: string; label: string; title: string; events: EnrichedEvent[] }[] {
  const map = new Map<string, EnrichedEvent[]>();
  const meta = new Map<string, { label: string; title: string }>();
  for (const e of events) {
    if (!map.has(e.standardId)) {
      map.set(e.standardId, []);
      meta.set(e.standardId, { label: e.standardAcronym || e.standardTitle.slice(0, 20), title: e.standardTitle });
    }
    map.get(e.standardId)!.push(e);
  }
  return Array.from(map.entries()).map(([id, evts]) => ({
    id,
    ...meta.get(id)!,
    events: evts.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()),
  }));
}

export function AggregateTimeline({ standards }: { standards: Standard[] | undefined }) {
  const navigate = useNavigate();

  const { data: summaries, isLoading } = useQuery({
    queryKey: ["all-timeline-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standard_summaries")
        .select("standard_id, timeline_events")
        .not("timeline_events", "eq", "[]");
      if (error) throw error;
      return data;
    },
  });

  const enrichedEvents: EnrichedEvent[] = (() => {
    if (!summaries || !standards) return [];
    const stdMap = new Map(standards.map((s) => [s.id, s]));
    const all: EnrichedEvent[] = [];

    for (const summary of summaries) {
      const std = stdMap.get(summary.standard_id);
      if (!std) continue;
      const events = summary.timeline_events as unknown as TimelineEvent[] | null;
      if (!events || !Array.isArray(events)) continue;

      for (const ev of events) {
        if (!ev.date || !ev.title) continue;
        all.push({
          ...ev,
          standardId: std.id,
          standardTitle: std.title,
          standardAcronym: std.acronym,
        });
      }
    }

    all.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
    return all;
  })();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (enrichedEvents.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No timeline data available yet. Generate summaries for standards to populate this view.
      </div>
    );
  }

  const rows = groupByStandard(enrichedEvents).sort((a, b) => {
    const aLatest = parseDate(a.events[a.events.length - 1]?.date ?? "1900-01-01").getTime();
    const bLatest = parseDate(b.events[b.events.length - 1]?.date ?? "1900-01-01").getTime();
    return bLatest - aLatest;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {enrichedEvents.length} events across {rows.length} standards
        </span>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <section key={row.id} className="rounded-lg border bg-background/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                onClick={() => navigate(`/standard/${row.id}`)}
                className="max-w-[220px] truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-primary active:scale-[0.98]"
                title={row.title}
              >
                {row.title}
              </button>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {row.events.length} event{row.events.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max items-start gap-0 pr-6">
                {row.events.map((event, i) => {
                  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                  const Icon = config.icon;
                  const isLast = i === row.events.length - 1;

                  return (
                    <div key={`${row.id}-${i}`} className="flex items-start">
                      <div className="w-[240px] shrink-0">
                        <div className="mb-2 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {formatDate(event.date)}
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60"
                            style={{ backgroundColor: config.bg }}
                          >
                            <Icon className="h-4 w-4" style={{ color: config.color }} />
                          </div>
                          {!isLast && <div className="h-px flex-1 bg-border" />}
                        </div>

                        <div className="mt-3 rounded-md border bg-card p-3 shadow-sm transition-[box-shadow] hover:shadow-md">
                          <p className="text-sm font-medium leading-tight text-foreground">{event.title}</p>
                          {event.description && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
