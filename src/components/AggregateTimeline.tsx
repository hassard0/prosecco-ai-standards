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

  const rows = groupByStandard(enrichedEvents);

  // Global date range for alignment
  const allDates = enrichedEvents.map((e) => parseDate(e.date).getTime());
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const range = maxDate - minDate || 1;

  // Generate year tick marks
  const minYear = new Date(minDate).getFullYear();
  const maxYear = new Date(maxDate).getFullYear();
  const yearTicks: { year: number; pct: number }[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    const t = new Date(`${y}-01-01`).getTime();
    yearTicks.push({ year: y, pct: ((t - minDate) / range) * 100 });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {enrichedEvents.length} events across {rows.length} standards
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(1200, rows.length * 60 + 200) }}>
          {/* Year axis */}
          <div className="flex items-end mb-1 pl-[140px]">
            <div className="flex-1 relative h-5">
              {yearTicks.map((t) => (
                <span
                  key={t.year}
                  className="absolute text-[10px] font-semibold text-muted-foreground tabular-nums -translate-x-1/2"
                  style={{ left: `${Math.min(Math.max(t.pct, 2), 98)}%` }}
                >
                  {t.year}
                </span>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-0 group/row">
                {/* Standard label */}
                <button
                  onClick={() => navigate(`/standard/${row.id}`)}
                  className="w-[140px] shrink-0 text-right pr-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors truncate active:scale-[0.97]"
                  title={row.title}
                >
                  {row.label}
                </button>

                {/* Track */}
                <div className="flex-1 relative h-10 rounded bg-muted/20 group-hover/row:bg-muted/40 transition-colors">
                  {/* Horizontal baseline */}
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />

                  {/* Year gridlines */}
                  {yearTicks.map((t) => (
                    <div
                      key={t.year}
                      className="absolute top-0 bottom-0 w-px bg-border/40"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}

                  {/* Event dots */}
                  {row.events.map((event, i) => {
                    const pct = ((parseDate(event.date).getTime() - minDate) / range) * 100;
                    const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                    const Icon = config.icon;

                    return (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group/dot"
                        style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }}
                      >
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full cursor-default hover:scale-125 transition-transform"
                          style={{ backgroundColor: config.bg }}
                          title={`${event.title} — ${formatDate(event.date)}`}
                        >
                          <Icon className="h-3 w-3" style={{ color: config.color }} />
                        </div>

                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/dot:block z-20 pointer-events-none">
                          <div className="bg-popover border rounded-md shadow-md px-2.5 py-1.5 w-48 text-left">
                            <p className="text-[11px] font-medium text-foreground leading-tight">{event.title}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{formatDate(event.date)}</p>
                            {event.description && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
