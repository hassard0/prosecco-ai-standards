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

  const yearGroups = groupByYear(enrichedEvents);
  const years = Object.keys(yearGroups).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {enrichedEvents.length} events across {summaries?.length ?? 0} standards
        </span>
      </div>

      {/* Horizontal scrollable timeline */}
      <div className="relative overflow-x-auto pb-4">
        {/* Horizontal line */}
        <div className="absolute top-[30px] left-0 right-0 h-px bg-border" />

        <div className="flex gap-0 min-w-max">
          {years.map((year, yi) => (
            <div key={year} className="flex items-start">
              {/* Year marker */}
              <div className="flex flex-col items-center shrink-0 relative" style={{ width: 60 }}>
                <span className="text-[10px] font-bold text-foreground mb-1.5 tracking-wide">{year}</span>
                <div className="h-3 w-3 rounded-full bg-muted border-2 border-border z-10" />
              </div>

              {/* Events for this year */}
              <div className="flex gap-3 pt-0">
                {yearGroups[year].map((event, i) => {
                  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                  const Icon = config.icon;
                  const label = event.standardAcronym || event.standardTitle.slice(0, 16);

                  return (
                    <div
                      key={`${event.standardId}-${i}`}
                      className="flex flex-col items-center shrink-0 group"
                      style={{ width: 140 }}
                    >
                      {/* Date */}
                      <span className="text-[9px] text-muted-foreground tabular-nums mb-1">
                        {formatDate(event.date)}
                      </span>

                      {/* Node on the line */}
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded-full z-10 shrink-0"
                        style={{ backgroundColor: config.bg }}
                      >
                        <Icon className="h-3 w-3" style={{ color: config.color }} />
                      </div>

                      {/* Card below */}
                      <button
                        onClick={() => navigate(`/standard/${event.standardId}`)}
                        className="mt-2 w-full rounded-md border bg-card p-2 text-left hover:bg-muted/50 transition-colors active:scale-[0.97] cursor-pointer"
                      >
                        <span
                          className="text-[9px] font-semibold px-1 py-0.5 rounded bg-muted text-muted-foreground inline-block mb-1 truncate max-w-full"
                          title={event.standardTitle}
                        >
                          {label}
                        </span>
                        <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2">
                          {event.title}
                        </p>
                        {event.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                            {event.description}
                          </p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Spacer between years */}
              {yi < years.length - 1 && <div className="w-6 shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
