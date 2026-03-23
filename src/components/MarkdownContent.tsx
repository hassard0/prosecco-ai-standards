import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-card-foreground leading-relaxed
      prose-headings:text-foreground prose-headings:font-semibold
      prose-h2:text-sm prose-h2:mt-4 prose-h2:mb-1
      prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1
      prose-p:text-sm prose-p:my-1.5
      prose-li:text-sm prose-li:my-0.5
      prose-strong:text-foreground
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
