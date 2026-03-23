import { Sparkles } from "lucide-react";

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
      <div className="prose prose-sm dark:prose-invert max-w-none text-card-foreground leading-relaxed">
        {content.split("\n").map((line, i) => {
          if (line.startsWith("## "))
            return (
              <h3 key={i} className="text-sm font-semibold mt-3 mb-1">
                {line.slice(3)}
              </h3>
            );
          if (line.startsWith("- "))
            return (
              <li key={i} className="text-sm ml-4">
                {line.slice(2)}
              </li>
            );
          if (line.startsWith("**") && line.endsWith("**"))
            return (
              <p key={i} className="text-sm font-semibold mt-2">
                {line.slice(2, -2)}
              </p>
            );
          if (line.trim())
            return (
              <p key={i} className="text-sm">
                {line}
              </p>
            );
          return null;
        })}
      </div>
    </div>
  );
}
