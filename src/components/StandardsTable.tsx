import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Standard } from "@/hooks/useStandards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StandardsTableProps {
  standards: Standard[];
}

type SortKey = "title" | "status" | "organization" | "updated_at";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { Emerging: 0, Draft: 1, Approved: 2 };
const STATUS_COLOR: Record<string, string> = {
  Emerging: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Draft: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

export function StandardsTable({ standards }: StandardsTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
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
        case "updated_at":
          cmp = a.updated_at.localeCompare(b.updated_at);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [standards, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {([
              ["title", "Standard"],
              ["status", "Status"],
              ["organization", "Organization"],
              ["updated_at", "Updated"],
            ] as [SortKey, string][]).map(([key, label]) => (
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
            <TableHead className="text-xs font-semibold">Tags</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                No standards match your filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((s) => (
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
                <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {new Date(s.updated_at).toLocaleDateString()}
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
