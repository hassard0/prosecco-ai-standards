import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStandards, useTags } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { KanbanColumn } from "./KanbanColumn";
import { StandardsFilterBar } from "./StandardsFilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LayoutList, Rows3 } from "lucide-react";

interface KanbanBoardProps {
  searchQuery: string;
}

const COLUMNS = [
  { status: "Emerging" as const, label: "Emerging", color: "hsl(38 80% 55%)" },
  { status: "Draft" as const, label: "Draft", color: "hsl(220 60% 55%)" },
  { status: "Approved" as const, label: "Approved", color: "hsl(152 60% 42%)" },
];

export function KanbanBoard({ searchQuery }: KanbanBoardProps) {
  const { data: standards, isLoading, error } = useStandards();
  const { data: tags } = useTags();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("detailed");
  const [mobileTab, setMobileTab] = useState(0);
  const navigate = useNavigate();

  const allTags = useMemo(() => {
    if (!tags) return [];
    return tags.map((t) => t.name);
  }, [tags]);

  const allOrganizations = useMemo(() => {
    if (!standards) return [];
    const orgs = new Set(standards.filter((s) => s.organization && s.status !== "Backlog").map((s) => s.organization!));
    return [...orgs].sort();
  }, [standards]);

  const filtered = useMemo(() => {
    if (!standards) return [];
    const published = standards.filter((s) => s.status !== "Backlog");
    const query = searchQuery.toLowerCase().trim();
    return published.filter((s) => {
      const matchesSearch =
        !query ||
        s.title.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        (s.acronym && s.acronym.toLowerCase().includes(query));

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => s.tags?.includes(tag));

      const matchesOrgs =
        selectedOrgs.length === 0 ||
        (s.organization && selectedOrgs.includes(s.organization));

      return matchesSearch && matchesTags && matchesOrgs;
    });
  }, [standards, searchQuery, selectedTags, selectedOrgs]);


  const columnData = COLUMNS.map((col) => ({
    ...col,
    standards: filtered.filter((s) => s.status === col.status),
  }));

  if (error) {
    return (
      <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-8 text-center">
        <p className="text-sm text-destructive">Failed to load standards. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <StandardsFilterBar
          allTags={allTags}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          allOrganizations={allOrganizations}
          selectedOrganizations={selectedOrgs}
          onOrganizationsChange={setSelectedOrgs}
        />
        <div className="flex items-center gap-1 p-1 rounded-md bg-muted shrink-0">
          <button
            onClick={() => setViewMode("compact")}
            className={cn(
              "p-1.5 rounded transition-colors active:scale-95",
              viewMode === "compact" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            title="Compact view"
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("detailed")}
            className={cn(
              "p-1.5 rounded transition-colors active:scale-95",
              viewMode === "detailed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            title="Detailed view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-6 w-24" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Mobile tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted md:hidden">
            {columnData.map((col, i) => (
              <button
                key={col.status}
                onClick={() => setMobileTab(i)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all",
                  "active:scale-[0.97]",
                  mobileTab === i
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                {col.label}
                <span className="tabular-nums text-[10px] opacity-60">{col.standards.length}</span>
              </button>
            ))}
          </div>

          {/* Mobile: single column */}
          <div className="md:hidden">
            <div key={columnData[mobileTab].status}>
              <KanbanColumn
                title={columnData[mobileTab].label}
                accentColor={columnData[mobileTab].color}
                standards={columnData[mobileTab].standards}
                onSelectStandard={(s) => navigate(`/standard/${s.id}`)}
                viewMode={viewMode}
              />
            </div>
          </div>

          {/* Desktop: three columns */}
          <div className="hidden md:grid md:grid-cols-3 gap-6">
            {columnData.map((col) => (
              <KanbanColumn
                key={col.status}
                title={col.label}
                accentColor={col.color}
                standards={col.standards}
                onSelectStandard={(s) => navigate(`/standard/${s.id}`)}
                viewMode={viewMode}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
