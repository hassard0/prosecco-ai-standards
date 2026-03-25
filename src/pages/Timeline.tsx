import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AggregateTimeline } from "@/components/AggregateTimeline";
import { useStandards } from "@/hooks/useStandards";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

export default function TimelinePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to directory
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1" style={{ lineHeight: "1.1" }}>
            Standards Timeline
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            A chronological view of key events across all AI standards with generated summaries.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-5">
            <AggregateTimeline standards={standards?.filter(s => s.status !== "Backlog")} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
