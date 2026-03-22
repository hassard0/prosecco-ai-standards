import { ExternalLink } from "lucide-react";
import type { Standard } from "@/hooks/useStandards";
import { cn } from "@/lib/utils";

interface StandardCardProps {
  standard: Standard;
  onClick: () => void;
  index: number;
}

export function StandardCard({ standard, onClick, index }: StandardCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-lg border bg-card p-4 transition-all duration-200",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        "active:scale-[0.98] active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "animate-in fade-in slide-in-from-bottom-2"
      )}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both", animationDuration: "500ms" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm leading-snug text-card-foreground line-clamp-2 text-wrap-balance">
          {standard.title}
        </h3>
        {standard.link && (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
        )}
      </div>

      {standard.acronym && (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-primary/10 text-primary mb-2">
          {standard.acronym}
        </span>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">
        {standard.description}
      </p>

      {standard.tags && standard.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {standard.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
