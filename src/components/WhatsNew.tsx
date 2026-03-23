import { Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";

export function WhatsNew({ content, generatedAt }: { content: string; generatedAt: string }) {
  if (!content) return null;

  return (
    <div className="rounded-lg border bg-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">What's New</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        AI-generated · Updated{" "}
        {new Date(generatedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <MarkdownContent content={content} />
    </div>
  );
}
