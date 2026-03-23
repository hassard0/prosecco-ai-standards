import { ExternalLink } from "lucide-react";
import type { Standard } from "@/hooks/useStandards";
import { cn } from "@/lib/utils";

interface StandardCardProps {
  standard: Standard;
  onClick: () => void;
  index: number;
  viewMode?: "compact" | "detailed";
}

export function StandardCard({ standard, onClick, index, viewMode = "detailed" }: StandardCardProps) {
  const isCompact = viewMode === "compact";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-lg border bg-card transition-all duration-200",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        "active:scale-[0.98] active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "animate-in fade-in slide-in-from-bottom-2",
        isCompact ? "px-3 py-2" : "p-4"
      )}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both", animationDuration: "500ms" }}
    >
      <div className={cn("flex items-start justify-between gap-2", !isCompact && "mb-2")}>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn(
            "font-medium leading-snug text-card-foreground",
            isCompact ? "text-xs line-clamp-1" : "text-sm line-clamp-2 text-wrap-balance"
          )}>
            {standard.title}
          </h3>
          {isCompact && standard.acronym && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase rounded bg-primary/10 text-primary">
              {standard.acronym}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {standard.organization && (
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {standard.organization}
            </span>
          )}
          {standard.link && (
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>

      {!isCompact && standard.acronym && (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-primary/10 text-primary mb-2">
          {standard.acronym}
        </span>
      )}

      {!isCompact && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">
          {standard.description}
        </p>
      )}

      {standard.tags && standard.tags.length > 0 && (
        <div className={cn("flex flex-wrap gap-1", isCompact && "mt-1")}>
          {(isCompact ? standard.tags.slice(0, 3) : standard.tags).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {isCompact && standard.tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
              +{standard.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
