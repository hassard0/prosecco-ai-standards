import type { Standard } from "@/hooks/useStandards";
import { StandardCard } from "./StandardCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  title: string;
  standards: Standard[];
  accentColor: string;
  onSelectStandard: (standard: Standard) => void;
  viewMode: "compact" | "detailed";
}

export function KanbanColumn({ title, standards, accentColor, onSelectStandard, viewMode }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-4 px-1">
        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
        <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
        <span className={cn(
          "ml-auto text-xs font-medium tabular-nums px-2 py-0.5 rounded-full",
          "bg-muted text-muted-foreground"
        )}>
          {standards.length}
        </span>
      </div>

      <div className="space-y-3 flex-1">
        {standards.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
            <p className="text-xs text-muted-foreground">No standards yet</p>
          </div>
        ) : (
          standards.map((standard, index) => (
            <StandardCard
              key={standard.id}
              standard={standard}
              onClick={() => onSelectStandard(standard)}
              index={index}
            />
          ))
        )}
      </div>
    </div>
  );
}
