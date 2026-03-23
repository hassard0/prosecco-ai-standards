import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface StandardsFilterBarProps {
  allTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  allOrganizations: string[];
  selectedOrganizations: string[];
  onOrganizationsChange: (orgs: string[]) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterNoResources?: boolean;
  onFilterNoResourcesChange?: (val: boolean) => void;
  filterNoSummaries?: boolean;
  onFilterNoSummariesChange?: (val: boolean) => void;
  showExpired?: boolean;
  onShowExpiredChange?: (val: boolean) => void;
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 h-8 text-xs font-medium",
            selected.length > 0 && "border-primary/40 bg-primary/5 text-foreground"
          )}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder={`Search ${label.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No matches</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
              >
                <Checkbox checked={selected.includes(opt)} className="h-3.5 w-3.5 pointer-events-none" />
                <span className="truncate">{opt}</span>
              </button>
            ))
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1.5">
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => onChange([])}>
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function StandardsFilterBar({
  allTags,
  selectedTags,
  onTagsChange,
  allOrganizations,
  selectedOrganizations,
  onOrganizationsChange,
  searchQuery,
  onSearchChange,
  filterNoResources,
  onFilterNoResourcesChange,
  filterNoSummaries,
  onFilterNoSummariesChange,
  showExpired,
  onShowExpiredChange,
}: StandardsFilterBarProps) {
  const hasFilters = selectedTags.length > 0 || selectedOrganizations.length > 0 || searchQuery.length > 0 || !!filterNoResources || !!filterNoSummaries || !!showExpired;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search standards…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-48 pl-8 text-xs"
        />
      </div>
      <MultiSelectFilter label="Tags" options={allTags} selected={selectedTags} onChange={onTagsChange} />
      <MultiSelectFilter label="Organization" options={allOrganizations} selected={selectedOrganizations} onChange={onOrganizationsChange} />
      {onFilterNoResourcesChange && (
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 h-8 text-xs font-medium",
            filterNoResources && "border-destructive/40 bg-destructive/5 text-foreground"
          )}
          onClick={() => onFilterNoResourcesChange(!filterNoResources)}
        >
          No Resources
        </Button>
      )}
      {onFilterNoSummariesChange && (
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 h-8 text-xs font-medium",
            filterNoSummaries && "border-destructive/40 bg-destructive/5 text-foreground"
          )}
          onClick={() => onFilterNoSummariesChange(!filterNoSummaries)}
        >
          No Summaries
        </Button>
      )}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground"
          onClick={() => {
            onTagsChange([]); onOrganizationsChange([]); onSearchChange("");
            onFilterNoResourcesChange?.(false);
            onFilterNoSummariesChange?.(false);
          }}
        >
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}
