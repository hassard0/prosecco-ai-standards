import { ExternalLink } from "lucide-react";
import type { Standard } from "@/hooks/useStandards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StandardDetailDialogProps {
  standard: Standard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StandardDetailDialog({ standard, open, onOpenChange }: StandardDetailDialogProps) {
  if (!standard) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-xl">{standard.title}</DialogTitle>
            {standard.acronym && (
              <span className="px-2 py-0.5 text-xs font-semibold tracking-wider uppercase rounded-full bg-primary/10 text-primary">
                {standard.acronym}
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">
            Details for {standard.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border"
              style={{
                backgroundColor: standard.status === "Approved"
                  ? "hsl(152 60% 42% / 0.1)"
                  : standard.status === "Draft"
                    ? "hsl(220 60% 55% / 0.1)"
                    : "hsl(38 80% 55% / 0.1)",
                color: standard.status === "Approved"
                  ? "hsl(152 60% 32%)"
                  : standard.status === "Draft"
                    ? "hsl(220 60% 45%)"
                    : "hsl(38 80% 40%)",
                borderColor: "transparent",
              }}
            >
              {standard.status}
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {standard.description}
          </p>

          {standard.tags && standard.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {standard.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {standard.link && (
            <Button asChild className="w-full mt-2">
              <a href={standard.link} target="_blank" rel="noopener noreferrer">
                View Specification
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
