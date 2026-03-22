import { useState, useMemo } from "react";
import { useStandards, useTags } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { KanbanColumn } from "./KanbanColumn";
import { StandardDetailDialog } from "./StandardDetailDialog";
import { TagFilter } from "./TagFilter";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [selectedStandard, setSelectedStandard] = useState<Standard | null>(null);

  const allTags = useMemo(() => {
    if (!tags) return [];
    return tags.map((t) => t.name);
  }, [tags]);

  const filtered = useMemo(() => {
    if (!standards) return [];
    const query = searchQuery.toLowerCase().trim();
    return standards.filter((s) => {
      const matchesSearch =
        !query ||
        s.title.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        (s.acronym && s.acronym.toLowerCase().includes(query));

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => s.tags?.includes(tag));

      return matchesSearch && matchesTags;
    });
  }, [standards, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (error) {
    return (
      <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-8 text-center">
        <p className="text-sm text-destructive">Failed to load standards. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TagFilter tags={allTags} selectedTags={selectedTags} onToggleTag={toggleTag} />

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              title={col.label}
              accentColor={col.color}
              standards={filtered.filter((s) => s.status === col.status)}
              onSelectStandard={setSelectedStandard}
            />
          ))}
        </div>
      )}

      <StandardDetailDialog
        standard={selectedStandard}
        open={!!selectedStandard}
        onOpenChange={(open) => !open && setSelectedStandard(null)}
      />
    </div>
  );
}
