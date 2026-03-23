import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Rocket,
  FileText,
  Users,
  Flag,
  Clock,
  Star,
  Circle,
  Search,
  X,
  CalendarIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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

interface TimelineRow {
  id: string;
  label: string;
  title: string;
  events: EnrichedEvent[];
}

const TYPE_CONFIG: Record<string, { icon: typeof Calendar; colorClass: string; bgClass: string }> = {
  release: { icon: Rocket, colorClass: "text-emerald-700", bgClass: "bg-emerald-100" },
  draft: { icon: FileText, colorClass: "text-blue-700", bgClass: "bg-blue-100" },
  decision: { icon: Flag, colorClass: "text-amber-700", bgClass: "bg-amber-100" },
  meeting: { icon: Users, colorClass: "text-fuchsia-700", bgClass: "bg-fuchsia-100" },
  deadline: { icon: Clock, colorClass: "text-rose-700", bgClass: "bg-rose-100" },
  milestone: { icon: Star, colorClass: "text-sky-700", bgClass: "bg-sky-100" },
  other: { icon: Circle, colorClass: "text-zinc-600", bgClass: "bg-zinc-100" },
};

const LABEL_WIDTH = 192;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDate(dateStr: string): Date {
  if (/^\d{4}$/.test(dateStr)) return new Date(`${dateStr}-01-01T00:00:00`);
  if (/^\d{4}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}-01T00:00:00`);
  return new Date(dateStr);
}

function formatDateLabel(dateStr: string) {
  try {
    if (/^\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return new Date(`${dateStr}-01T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });
    }
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function SearchableStandardFilter({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((value) => value !== id));
      return;
    }
    onChange([...selected, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        {selected.length === 0 ? "All standards" : `${selected.length} selected`}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border bg-popover shadow-md">
          <div className="border-b p-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search standards…"
              className="h-8 text-xs"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No matching standards</p>
            ) : (
              filteredOptions.map((option) => {
                const active = selected.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleSelection(option.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      )}
                    >
                      {active && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                          <path
                            d="M2.5 6.2 4.8 8.5 9.5 3.8"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AggregateTimeline({ standards }: { standards: Standard[] | undefined }) {
  const navigate = useNavigate();
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

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

  const allEvents = useMemo(() => {
    if (!summaries || !standards) return [] as EnrichedEvent[];

    const standardMap = new Map(standards.map((standard) => [standard.id, standard]));
    const events: EnrichedEvent[] = [];

    for (const summary of summaries) {
      const standard = standardMap.get(summary.standard_id);
      if (!standard) continue;

      const timelineEvents = summary.timeline_events as unknown as TimelineEvent[] | null;
      if (!timelineEvents || !Array.isArray(timelineEvents)) continue;

      for (const event of timelineEvents) {
        if (!event.date || !event.title) continue;
        events.push({
          ...event,
          standardId: standard.id,
          standardTitle: standard.title,
          standardAcronym: standard.acronym,
        });
      }
    }

    return events.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
  }, [standards, summaries]);

  const standardOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const event of allEvents) {
      if (!map.has(event.standardId)) {
        map.set(event.standardId, event.standardAcronym || event.standardTitle);
      }
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    let next = allEvents;

    if (selectedStandards.length > 0) {
      const allowed = new Set(selectedStandards);
      next = next.filter((event) => allowed.has(event.standardId));
    }

    if (dateFrom) {
      next = next.filter((event) => parseDate(event.date).getTime() >= dateFrom.getTime());
    }

    if (dateTo) {
      const inclusiveEnd = new Date(dateTo);
      inclusiveEnd.setHours(23, 59, 59, 999);
      next = next.filter((event) => parseDate(event.date).getTime() <= inclusiveEnd.getTime());
    }

    return next;
  }, [allEvents, dateFrom, dateTo, selectedStandards]);

  const rows = useMemo(() => {
    const map = new Map<string, TimelineRow>();

    for (const event of filteredEvents) {
      if (!map.has(event.standardId)) {
        map.set(event.standardId, {
          id: event.standardId,
          label: event.standardAcronym || event.standardTitle,
          title: event.standardTitle,
          events: [],
        });
      }

      map.get(event.standardId)?.events.push(event);
    }

    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredEvents]);

  const timelineMetrics = useMemo(() => {
    if (filteredEvents.length === 0) {
      return {
        minTime: 0,
        maxTime: 1,
        trackWidth: 1200,
        ticks: [] as { year: number; x: number }[],
      };
    }

    const sourceTimes = filteredEvents.map((event) => parseDate(event.date).getTime());
    const padding = 90 * 24 * 60 * 60 * 1000;
    const minTime = Math.min(...sourceTimes) - padding;
    const maxTime = Math.max(...sourceTimes) + padding;
    const span = Math.max(1, maxTime - minTime);

    const minYear = new Date(minTime).getFullYear();
    const maxYear = new Date(maxTime).getFullYear();
    const trackWidth = Math.max(1400, (maxYear - minYear + 1) * 320);

    const positionFor = (time: number) => ((time - minTime) / span) * trackWidth;

    const ticks: { year: number; x: number }[] = [];
    for (let year = minYear; year <= maxYear + 1; year += 1) {
      const tickTime = new Date(`${year}-01-01T00:00:00`).getTime();
      const x = positionFor(tickTime);
      if (x >= 0 && x <= trackWidth) {
        ticks.push({ year, x });
      }
    }

    return { minTime, maxTime, trackWidth, ticks };
  }, [filteredEvents]);

  const positionForEvent = (date: string) => {
    const time = parseDate(date).getTime();
    const span = Math.max(1, timelineMetrics.maxTime - timelineMetrics.minTime);
    return ((time - timelineMetrics.minTime) / span) * timelineMetrics.trackWidth;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (allEvents.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No timeline data available yet. Generate summaries for standards to populate this view.
      </div>
    );
  }

  const hasActiveFilters = selectedStandards.length > 0 || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} across {rows.length} standard{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchableStandardFilter
          options={standardOptions}
          selected={selectedStandards}
          onChange={setSelectedStandards}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 gap-1.5 text-xs", !dateTo && "text-muted-foreground")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {selectedStandards.map((id) => {
          const selected = standardOptions.find((option) => option.id === id);
          if (!selected) return null;

          return (
            <Badge key={id} variant="secondary" className="gap-1 px-2 py-1 text-[10px]">
              <span className="max-w-[120px] truncate">{selected.label}</span>
              <button
                type="button"
                onClick={() => setSelectedStandards(selectedStandards.filter((value) => value !== id))}
                className="transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSelectedStandards([]);
              setDateFrom(undefined);
              setDateTo(undefined);
            }}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No events match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background/50">
          <div style={{ width: LABEL_WIDTH + timelineMetrics.trackWidth }}>
            <div className="flex border-b bg-muted/20">
              <div
                className="shrink-0 border-r px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                style={{ width: LABEL_WIDTH }}
              >
                Standard
              </div>

              <div className="relative h-12" style={{ width: timelineMetrics.trackWidth }}>
                {timelineMetrics.ticks.map((tick) => (
                  <div
                    key={tick.year}
                    className="absolute inset-y-0"
                    style={{ left: tick.x }}
                  >
                    <div className="absolute inset-y-0 w-px bg-border/60" />
                    <span className="absolute left-2 top-3 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {tick.year}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {rows.map((row) => (
              <div key={row.id} className="flex border-b last:border-b-0 hover:bg-muted/10">
                <button
                  type="button"
                  onClick={() => navigate(`/standard/${row.id}`)}
                  title={row.title}
                  className="shrink-0 truncate border-r px-4 py-4 text-left text-sm font-medium text-foreground transition-colors hover:text-primary active:scale-[0.98]"
                  style={{ width: LABEL_WIDTH }}
                >
                  {row.title}
                </button>

                <div className="relative" style={{ width: timelineMetrics.trackWidth, height: 76 }}>
                  {timelineMetrics.ticks.map((tick) => (
                    <div
                      key={tick.year}
                      className="absolute inset-y-0 w-px bg-border/30"
                      style={{ left: tick.x }}
                    />
                  ))}

                  <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />

                  {row.events.map((event, index) => {
                    const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                    const Icon = config.icon;
                    const x = positionForEvent(event.date);

                    return (
                      <div
                        key={`${row.id}-${index}`}
                        className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: x }}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border border-background shadow-sm transition-transform group-hover:scale-110",
                            config.bgClass,
                            config.colorClass
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-60 -translate-x-1/2 pt-3 group-hover:block">
                          <div className="rounded-md border bg-popover p-3 text-left shadow-lg">
                            <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {formatDateLabel(event.date)}
                            </p>
                            <p className="mt-1 text-sm font-medium leading-tight text-foreground">
                              {event.title}
                            </p>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
