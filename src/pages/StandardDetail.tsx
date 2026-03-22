import { useParams, Link } from "react-router-dom";
import { useStandards } from "@/hooks/useStandards";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Approved: { bg: "hsl(152 60% 42% / 0.1)", text: "hsl(152 60% 32%)" },
  Draft: { bg: "hsl(220 60% 55% / 0.1)", text: "hsl(220 60% 45%)" },
  Emerging: { bg: "hsl(38 80% 55% / 0.1)", text: "hsl(38 80% 40%)" },
  Backlog: { bg: "hsl(270 40% 55% / 0.1)", text: "hsl(270 40% 40%)" },
};

export default function StandardDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: standards, isLoading } = useStandards();
  const [searchQuery, setSearchQuery] = useState("");

  const standard = standards?.find((s) => s.id === id);
  const style = standard ? STATUS_STYLES[standard.status] || STATUS_STYLES.Emerging : STATUS_STYLES.Emerging;

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to directory
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !standard ? (
          <div className="rounded-lg border bg-muted/30 p-12 text-center">
            <p className="text-muted-foreground">Standard not found.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Return to directory</Link>
            </Button>
          </div>
        ) : (
          <article className="animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="flex items-start gap-3 flex-wrap mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground" style={{ lineHeight: "1.15" }}>
                {standard.title}
              </h1>
              {standard.acronym && (
                <span className="mt-1 px-2.5 py-1 text-xs font-semibold tracking-wider uppercase rounded-full bg-primary/10 text-primary shrink-0">
                  {standard.acronym}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span
                className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {standard.status}
              </span>
              {standard.organization && (
                <span className="text-sm text-muted-foreground">
                  by <span className="font-medium text-foreground">{standard.organization}</span>
                </span>
              )}
            </div>

            <div className="rounded-lg border bg-card p-6 sm:p-8 mb-6 shadow-sm">
              <p className="text-base text-card-foreground leading-relaxed" style={{ textWrap: "pretty" }}>
                {standard.description}
              </p>
            </div>

            {standard.tags && standard.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {standard.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs rounded-full bg-muted text-muted-foreground font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {standard.link && (
              <Button asChild size="lg" className="active:scale-[0.97] transition-all">
                <a href={standard.link} target="_blank" rel="noopener noreferrer">
                  View Specification
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}

            <p className="text-xs text-muted-foreground mt-8">
              Last updated {new Date(standard.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
