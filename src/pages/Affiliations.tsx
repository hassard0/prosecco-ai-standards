import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useStandards } from "@/hooks/useStandards";
import { Skeleton } from "@/components/ui/skeleton";
import { Sankey, Tooltip, Rectangle, Layer } from "recharts";

interface Author {
  name: string;
  company: string;
  role?: string;
  url?: string;
}

interface SankeyNode {
  name: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

// Custom node renderer for the Sankey diagram
function SankeyNode(props: any) {
  const { x, y, width, height, index, payload } = props;
  const isCompany = payload.depth === 0;

  return (
    <Layer key={`sankey-node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isCompany ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)"}
        fillOpacity={0.9}
        rx={3}
      />
      <text
        x={isCompany ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isCompany ? "end" : "start"}
        dominantBaseline="central"
        className="fill-foreground text-xs"
        style={{ fontSize: 11 }}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

export default function Affiliations() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();

  const sankeyData = useMemo(() => {
    if (!standards) return null;

    const companyStandardMap: Record<string, Set<string>> = {};

    for (const s of standards) {
      const authors = (s as any).authors as Author[] | undefined;
      if (!authors?.length) continue;
      for (const a of authors) {
        const company = a.company?.trim();
        if (!company) continue;
        if (!companyStandardMap[company]) companyStandardMap[company] = new Set();
        companyStandardMap[company].add(s.title);
      }
    }

    // Filter out companies with no connections
    const companies = Object.keys(companyStandardMap).sort();
    if (companies.length === 0) return null;

    // Get unique standards that have at least one author with a company
    const standardNames = [...new Set(companies.flatMap((c) => [...companyStandardMap[c]]))].sort();

    const nodes: SankeyNode[] = [
      ...companies.map((c) => ({ name: c })),
      ...standardNames.map((s) => ({ name: s })),
    ];

    const links: SankeyLink[] = [];
    for (const company of companies) {
      const companyIdx = companies.indexOf(company);
      for (const stdName of companyStandardMap[company]) {
        const stdIdx = companies.length + standardNames.indexOf(stdName);
        // Value = number of authors from this company on this standard
        const standard = standards.find((s) => s.title === stdName);
        const count = ((standard as any)?.authors as Author[] || []).filter(
          (a) => a.company?.trim() === company
        ).length;
        links.push({ source: companyIdx, target: stdIdx, value: count });
      }
    }

    return { nodes, links };
  }, [standards]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to directory
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ lineHeight: "1.15" }}>
            Company Affiliations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Which companies are involved in which AI standards, based on spec authorship.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-96 w-full" />
          </div>
        ) : !sankeyData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No author affiliation data available yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use "Enrich with AI" on standards to populate author data.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 overflow-x-auto">
            <Sankey
              width={900}
              height={Math.max(400, sankeyData.nodes.length * 28)}
              data={sankeyData}
              node={<SankeyNode />}
              nodePadding={14}
              nodeWidth={8}
              linkCurvature={0.5}
              margin={{ top: 10, right: 180, bottom: 10, left: 180 }}
              link={{ stroke: "hsl(var(--primary) / 0.15)", strokeOpacity: 0.6 }}
            >
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const data = payload[0].payload;
                  if (data.source && data.target) {
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <span className="font-medium">{data.source.name}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-medium">{data.target.name}</span>
                        <span className="text-muted-foreground ml-1.5">
                          {data.value} {data.value === 1 ? "author" : "authors"}
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </Sankey>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
