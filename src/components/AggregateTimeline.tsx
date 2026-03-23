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

function groupByYear(events: EnrichedEvent[]): Record<string, EnrichedEvent[]> {
  const groups: Record<string, EnrichedEvent[]> = {};
  for (const e of events) {
    const year = parseDate(e.date).getFullYear().toString();
    if (!groups[year]) groups[year] = [];
    groups[year].push(e);
  }
  return groups;
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
      const events = summary.timeline_events as TimelineEvent[] | null;
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

  const yearGroups = groupByYear(enrichedEvents);
  const years = Object.keys(yearGroups).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {enrichedEvents.length} events across {summaries?.length ?? 0} standards
        </span>
      </div>

      <div className="relative ml-3 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        {years.map((year) => (
          <div key={year} className="mb-4">
            {/* Year marker */}
            <div className="relative flex items-center gap-3 mb-2">
              <div className="relative z-10 h-[15px] w-[15px] shrink-0 rounded-full bg-muted flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-foreground/40" />
              </div>
              <span className="text-xs font-bold text-foreground tracking-wide">{year}</span>
            </div>

            <div className="space-y-1.5">
              {yearGroups[year].map((event, i) => {
                const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                const Icon = config.icon;
                const label = event.standardAcronym || event.standardTitle.slice(0, 20);

                return (
                  <div key={`${event.standardId}-${i}`} className="relative flex gap-3 group">
                    <div
                      className="relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: config.bg }}
                    >
                      <Icon className="h-2.5 w-2.5" style={{ color: config.color }} />
                    </div>

                    <div className="flex-1 min-w-0 pb-0.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/standard/${event.standardId}`)}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors truncate max-w-[100px] active:scale-[0.97]"
                          title={event.standardTitle}
                        >
                          {label}
                        </button>
                        <span className="text-xs font-medium text-foreground truncate">{event.title}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {formatDate(event.date)}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
