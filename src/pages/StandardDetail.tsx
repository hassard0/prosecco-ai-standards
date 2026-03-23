import { useParams, Link } from "react-router-dom";
import { useStandards } from "@/hooks/useStandards";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Mail, Github, BookOpen, Video, FileText, Link2, MessageCircle, Hash, Users, RefreshCw } from "lucide-react";
import { FlagStandardButton } from "@/components/FlagStandardButton";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniAuthorSankey } from "@/components/MiniAuthorSankey";
import { StandardTimeline } from "@/components/StandardTimeline";
import { WhatsNew } from "@/components/WhatsNew";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Approved: { bg: "hsl(152 60% 42% / 0.1)", text: "hsl(152 60% 32%)" },
  Draft: { bg: "hsl(220 60% 55% / 0.1)", text: "hsl(220 60% 45%)" },
  Emerging: { bg: "hsl(38 80% 55% / 0.1)", text: "hsl(38 80% 40%)" },
  Backlog: { bg: "hsl(270 40% 55% / 0.1)", text: "hsl(270 40% 40%)" },
};

const RESOURCE_ICONS: Record<string, typeof Mail> = {
  mailing_list: Mail,
  github: Github,
  discord: MessageCircle,
  slack: Hash,
  working_group: BookOpen,
  documentation: FileText,
  blog: FileText,
  video: Video,
  reference_impl: BookOpen,
  other: Link2,
};

function useSummaries(standardId: string | undefined) {
  return useQuery({
    queryKey: ["standard-summaries", standardId],
    queryFn: async () => {
      if (!standardId) return [];
      const { data, error } = await supabase
        .from("standard_summaries")
        .select("*")
        .eq("standard_id", standardId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!standardId,
  });
}

export default function StandardDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: standards, isLoading } = useStandards();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: summaries, refetch: refetchSummaries } = useSummaries(id);
  const { isAdmin } = useAuth();
  const [generating, setGenerating] = useState(false);
  const queryClient = useQueryClient();

  const standard = standards?.find((s) => s.id === id);
  const style = standard ? STATUS_STYLES[standard.status] || STATUS_STYLES.Emerging : STATUS_STYLES.Emerging;
  const resources = ((standard as any)?.resources as { type: string; label: string; url: string }[]) || [];
  const authors = ((standard as any)?.authors as { name: string; company: string; role?: string; url?: string }[]) || [];

  const handleGenerateSummary = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-mailing-list", {
        body: { standard_id: id },
      });
      if (error) throw error;
      toast.success("Summary generated successfully");
      refetchSummaries();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate summary");
    } finally {
      setGenerating(false);
    }
  };

  const latestSummary = summaries?.[0];
  const timelineEvents = (latestSummary as any)?.timeline_events || [];
  const whatsNew = (latestSummary as any)?.whats_new;

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

            {/* Generate Summary Button (admins) */}
            {resources.length > 0 && isAdmin && (
              <div className="mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={generating}
                  className="active:scale-[0.97] transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generating ? "animate-spin" : ""}`} />
                  {generating ? "Generating…" : latestSummary ? "Refresh Summary" : "Generate Summary"}
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-6">
              {standard.link && (
                <Button asChild size="lg" className="active:scale-[0.97] transition-all">
                  <a href={standard.link} target="_blank" rel="noopener noreferrer">
                    View Specification
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
              <FlagStandardButton standardId={standard.id} standardTitle={standard.title} />
            </div>

            {/* Authors & Affiliations */}
            {authors.length > 0 && (
              <div className="rounded-lg border bg-card p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Authors & Affiliations</h2>
                </div>

                <MiniAuthorSankey standardTitle={standard.acronym || standard.title} authors={authors} />

                {(() => {
                  const byCompany = authors.reduce<Record<string, typeof authors>>((acc, a) => {
                    const key = a.company || "Independent";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(a);
                    return acc;
                  }, {});
                  return (
                    <div className="space-y-3 mt-4 pt-4 border-t">
                      {Object.entries(byCompany).map(([company, people]) => (
                        <div key={company}>
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded bg-muted text-muted-foreground mb-1.5">
                            {company}
                          </span>
                          <div className="space-y-1 ml-1">
                            {people.map((a, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                {a.url ? (
                                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary transition-colors">
                                    {a.name}
                                  </a>
                                ) : (
                                  <span className="font-medium text-foreground">{a.name}</span>
                                )}
                                {a.role && (
                                  <span className="text-xs text-muted-foreground">· {a.role}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Additional Resources */}
            {resources.length > 0 && (
              <div className="rounded-lg border bg-card p-5 mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-3">Resources</h2>
                <div className="space-y-2">
                  {resources.map((res, i) => {
                    const Icon = RESOURCE_ICONS[res.type] || Link2;
                    return (
                      <a
                        key={i}
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors group"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {res.label || res.url}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}


            {/* What's New */}
            {whatsNew && latestSummary && (
              <WhatsNew content={whatsNew} generatedAt={latestSummary.generated_at} />
            )}

            {/* Timeline */}
            <StandardTimeline events={timelineEvents} />

            {/* Mailing List Summaries */}
            {latestSummary && (
              <div className="rounded-lg border bg-card p-5 mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-1">Discussion Summary</h2>
                <p className="text-[11px] text-muted-foreground mb-4">
                  AI-generated summary · Updated {new Date(latestSummary.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-card-foreground leading-relaxed">
                  {latestSummary.summary.split("\n").map((line, i) => {
                    if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(3)}</h3>;
                    if (line.startsWith("- ")) return <li key={i} className="text-sm ml-4">{line.slice(2)}</li>;
                    if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-sm font-semibold mt-3">{line.slice(2, -2)}</p>;
                    if (line.trim()) return <p key={i} className="text-sm">{line}</p>;
                    return null;
                  })}
                </div>
              </div>
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
