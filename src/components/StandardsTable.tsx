import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Standard } from "@/hooks/useStandards";
import type { Json } from "@/integrations/supabase/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, AlertTriangle, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface StandardsTableProps {
  standards: Standard[];
}

type SortKey = "title" | "status" | "organization" | "last_event" | "contributors" | "events" | "tags";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { Emerging: 0, Draft: 1, Approved: 2 };
const STATUS_COLOR: Record<string, string> = {
  Emerging: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Draft: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

interface TimelineEvent {
  date: string;
  title: string;
  type?: string;
}

function countAuthors(authors: Json | null): number {
  if (!Array.isArray(authors)) return 0;
  return authors.length;
}

function parseEvents(timeline_events: Json | null): TimelineEvent[] {
  if (!Array.isArray(timeline_events)) return [];
  return timeline_events as unknown as TimelineEvent[];
}

function latestEventDate(events: TimelineEvent[]): string | null {
  if (events.length === 0) return null;
  let latest = events[0].date;
  for (const e of events) {
    if (e.date > latest) latest = e.date;
  }
  return latest;
}

export function StandardsTable({ standards }: StandardsTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("last_event");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Fetch summaries for event counts and latest event dates
  const { data: summaries } = useQuery({
    queryKey: ["standard_summaries_table"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standard_summaries")
        .select("standard_id, timeline_events");
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Build lookup: standard_id -> { eventCount, latestDate }
  const summaryMap = useMemo(() => {
    const map = new Map<string, { eventCount: number; latestDate: string | null }>();
    if (!summaries) return map;
    for (const s of summaries) {
      const events = parseEvents(s.timeline_events);
      const existing = map.get(s.standard_id);
      const latest = latestEventDate(events);
      if (existing) {
        existing.eventCount += events.length;
        if (latest && (!existing.latestDate || latest > existing.latestDate)) {
          existing.latestDate = latest;
        }
      } else {
        map.set(s.standard_id, { eventCount: events.length, latestDate: latest });
      }
    }
    return map;
  }, [summaries]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" || key === "organization" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...standards];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case "organization":
          cmp = (a.organization ?? "").localeCompare(b.organization ?? "");
          break;
        case "contributors":
          cmp = countAuthors(a.authors) - countAuthors(b.authors);
          break;
        case "events": {
          const aE = summaryMap.get(a.id)?.eventCount ?? 0;
          const bE = summaryMap.get(b.id)?.eventCount ?? 0;
          cmp = aE - bE;
          break;
        }
        case "last_event": {
          const aD = summaryMap.get(a.id)?.latestDate ?? "";
          const bD = summaryMap.get(b.id)?.latestDate ?? "";
          cmp = aD.localeCompare(bD);
          break;
        }
        case "tags":
          cmp = (a.tags?.length ?? 0) - (b.tags?.length ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [standards, sortKey, sortDir, summaryMap]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const columns: [SortKey, string][] = [
    ["title", "Standard"],
    ["status", "Status"],
    ["organization", "Organization"],
    ["tags", "Categories"],
    ["contributors", "Contributors"],
    ["events", "Events"],
    ["last_event", "Last Activity"],
  ];

  const exportCsv = useCallback(() => {
    const header = ["Standard", "Acronym", "Status", "Organization", "Categories", "Contributors", "Events", "Last Activity", "Link"];
    const rows = sorted.map((s) => {
      const info = summaryMap.get(s.id);
      const lastDate = info?.latestDate;
      return [
        s.title,
        s.acronym ?? "",
        s.status,
        s.organization ?? "",
        (s.tags ?? []).join("; "),
        String(countAuthors(s.authors)),
        String(info?.eventCount ?? 0),
        lastDate ? new Date(lastDate).toLocaleDateString() : "",
        s.link ?? "",
      ];
    });
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-standards-directory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, summaryMap]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map(([key, label]) => (
              <TableHead key={key}>
                <button
                  onClick={() => toggleSort(key)}
                  className="flex items-center gap-1.5 text-xs font-semibold hover:text-foreground transition-colors"
                >
                  {label}
                  <SortIcon col={key} />
                </button>
              </TableHead>
            ))}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground text-sm">
                No standards match your filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((s) => {
              const info = summaryMap.get(s.id);
              const authorCount = countAuthors(s.authors);
              const eventCount = info?.eventCount ?? 0;
              const lastDate = info?.latestDate;

              return (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/standard/${s.id}`)}
                >
                  <TableCell className="font-medium max-w-xs">
                    <div className="flex items-center gap-2">
                      {s.is_expired && (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      )}
                      <span className="truncate">{s.title}</span>
                      {s.acronym && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                          {s.acronym}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0 font-medium", STATUS_COLOR[s.status])}
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">
                    {s.organization ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(s.tags ?? []).slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                      {(s.tags ?? []).length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{(s.tags ?? []).length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-center text-muted-foreground">
                    {authorCount || "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-center text-muted-foreground">
                    {eventCount || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {lastDate
                      ? new Date(lastDate).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {s.link && (
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
