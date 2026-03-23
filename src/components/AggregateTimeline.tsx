import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar, Rocket, FileText, Users, Flag, Clock, Star, Circle, Search, X, CalendarIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
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
  release: { icon: Rocket, color: "hsl(152 60% 32%)", bg: "hsl(152 60% 42% / 0.15)" },
  draft: { icon: FileText, color: "hsl(220 60% 45%)", bg: "hsl(220 60% 55% / 0.15)" },
  decision: { icon: Flag, color: "hsl(38 80% 40%)", bg: "hsl(38 80% 55% / 0.15)" },
  meeting: { icon: Users, color: "hsl(270 40% 40%)", bg: "hsl(270 40% 55% / 0.15)" },
  deadline: { icon: Clock, color: "hsl(0 60% 45%)", bg: "hsl(0 60% 50% / 0.15)" },
  milestone: { icon: Star, color: "hsl(200 60% 40%)", bg: "hsl(200 60% 50% / 0.15)" },
  other: { icon: Circle, color: "hsl(0 0% 45%)", bg: "hsl(0 0% 50% / 0.15)" },
};

function parseDate(dateStr: string): Date {
  if (/^\d{4}$/.test(dateStr)) return new Date(`${dateStr}-01-01`);
  if (/^\d{4}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}-01`);
  return new Date(dateStr);
}

function formatDateLabel(dateStr: string) {
  try {
    if (/^\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}$/.test(dateStr))
      return new Date(dateStr + "-01").toLocaleDateString("en-US", { year: "numeric", month: "short" });
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// ── Searchable multi-select dropdown ──
function StandardFilter({
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="h-3 w-3" />
        {selected.length === 0 ? "All standards" : `${selected.length} selected`}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <Input
              placeholder="Search standards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
            )}
            {filtered.map((o) => {
              const active = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                    active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 rounded border transition-colors",
                      active ? "border-primary bg-primary" : "border-border"
                    )}
                  >
                    {active && (
                      <svg viewBox="0 0 14 14" className="h-full w-full text-primary-foreground">
                        <path d="M3.5 7L6 9.5L10.5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-2">
              <button
                onClick={() => onChange([])}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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

// ── Main component ──
export function AggregateTimeline({ standards }: { standards: Standard[] | undefined }) {
  const navigate = useNavigate();
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

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

  // Build all enriched events
  const allEnriched: EnrichedEvent[] = useMemo(() => {
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
        all.push({ ...ev, standardId: std.id, standardTitle: std.title, standardAcronym: std.acronym });
      }
    }
    return all;
  }, [summaries, standards]);

  // Available standards for filter
  const availableStandards = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of allEnriched) {
      if (!seen.has(e.standardId))
        seen.set(e.standardId, e.standardAcronym || e.standardTitle);
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allEnriched]);

  // Filtered events
  const filtered = useMemo(() => {
    let events = allEnriched;
    if (selectedStandards.length > 0) {
      const set = new Set(selectedStandards);
      events = events.filter((e) => set.has(e.standardId));
    }
    if (dateFrom) events = events.filter((e) => parseDate(e.date) >= dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      events = events.filter((e) => parseDate(e.date) <= to);
    }
    return events;
  }, [allEnriched, selectedStandards, dateFrom, dateTo]);

  // Group by standard
  const rows = useMemo(() => {
    const map = new Map<string, EnrichedEvent[]>();
    const meta = new Map<string, { label: string; title: string }>();
    for (const e of filtered) {
      if (!map.has(e.standardId)) {
        map.set(e.standardId, []);
        meta.set(e.standardId, { label: e.standardAcronym || e.standardTitle.slice(0, 24), title: e.standardTitle });
      }
      map.get(e.standardId)!.push(e);
    }
    return Array.from(map.entries())
      .map(([id, evts]) => ({
        id,
        ...meta.get(id)!,
        events: evts.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);

  // Shared time axis
  const { minTime, maxTime, range, yearTicks } = useMemo(() => {
    if (filtered.length === 0) return { minTime: 0, maxTime: 1, range: 1, yearTicks: [] };
    const times = filtered.map((e) => parseDate(e.date).getTime());
    const pad = 90 * 24 * 60 * 60 * 1000;
    const min = Math.min(...times) - pad;
    const max = Math.max(...times) + pad;
    const r = max - min || 1;

    const minY = new Date(min).getFullYear();
    const maxY = new Date(max).getFullYear() + 1;
    const ticks: { year: number; pct: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      const pct = ((new Date(`${y}-01-01`).getTime() - min) / r) * 100;
      if (pct >= -2 && pct <= 102) ticks.push({ year: y, pct: Math.max(0, Math.min(100, pct)) });
    }
    return { minTime: min, maxTime: max, range: r, yearTicks: ticks };
  }, [filtered]);

  const LABEL_W = 160;
  const TRACK_MIN_W = 900;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (allEnriched.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No timeline data available yet. Generate summaries for standards to populate this view.
      </div>
    );
  }

  const hasFilters = selectedStandards.length > 0 || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Combined Timeline</h2>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""} across {rows.length} standard{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <StandardFilter options={availableStandards} selected={selectedStandards} onChange={setSelectedStandards} />

        {/* Date from */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {/* Date to */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {/* Selected badges + clear */}
        {selectedStandards.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 ml-1">
            {selectedStandards.map((id) => {
              const opt = availableStandards.find((o) => o.id === id);
              return (
                <Badge key={id} variant="secondary" className="gap-1 text-[10px] py-0.5 pl-2 pr-1">
                  {opt?.label || id.slice(0, 8)}
                  <button onClick={() => setSelectedStandards(selectedStandards.filter((s) => s !== id))} className="hover:text-foreground">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSelectedStandards([]); setDateFrom(undefined); setDateTo(undefined); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Chart */}
      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No events match the current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: LABEL_W + TRACK_MIN_W }}>
            {/* Year axis header */}
            <div className="flex" style={{ paddingLeft: LABEL_W }}>
              <div className="flex-1 relative h-6 border-b border-border">
                {yearTicks.map((t) => (
                  <span
                    key={t.year}
                    className="absolute bottom-1 text-[10px] font-semibold text-muted-foreground tabular-nums -translate-x-1/2"
                    style={{ left: `${t.pct}%` }}
                  >
                    {t.year}
                  </span>
                ))}
              </div>
            </div>

            {/* Rows */}
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-stretch border-b border-border/40 group/row hover:bg-muted/20 transition-colors"
              >
                {/* Label */}
                <button
                  onClick={() => navigate(`/standard/${row.id}`)}
                  className="shrink-0 text-right pr-4 py-3 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors truncate active:scale-[0.98]"
                  style={{ width: LABEL_W }}
                  title={row.title}
                >
                  {row.label}
                </button>

                {/* Track */}
                <div className="flex-1 relative py-2" style={{ minHeight: 44 }}>
                  {/* Year gridlines */}
                  {yearTicks.map((t) => (
                    <div
                      key={t.year}
                      className="absolute top-0 bottom-0 w-px bg-border/30"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}

                  {/* Center baseline */}
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-border/50 -translate-y-1/2" />

                  {/* Event dots */}
                  {row.events.map((event, i) => {
                    const pct = ((parseDate(event.date).getTime() - minTime) / range) * 100;
                    const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
                    const Icon = config.icon;

                    return (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group/dot"
                        style={{ left: `${Math.max(1, Math.min(99, pct))}%` }}
                      >
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 cursor-default hover:scale-[1.3] transition-transform"
                          style={{ backgroundColor: config.bg }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                        </div>

                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/dot:block z-30 pointer-events-none">
                          <div className="bg-popover border rounded-md shadow-lg px-3 py-2 w-56 text-left">
                            <p className="text-xs font-semibold text-foreground leading-tight">{event.title}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums mt-1">{formatDateLabel(event.date)}</p>
                            {event.description && (
                              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed line-clamp-3">{event.description}</p>
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
