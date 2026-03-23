import { useState, useMemo, useRef, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useStandards } from "@/hooks/useStandards";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { ArrowLeft, X, Search, ChevronDown } from "lucide-react";
import { Sankey, Tooltip, Rectangle, Layer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Author {
  name: string;
  company: string;
  role?: string;
  url?: string;
}

const COMPANY_COLORS = [
  "hsl(220 70% 50%)",
  "hsl(340 65% 47%)",
  "hsl(160 55% 40%)",
  "hsl(30 80% 50%)",
  "hsl(270 55% 50%)",
  "hsl(190 60% 42%)",
  "hsl(10 70% 48%)",
  "hsl(90 50% 40%)",
  "hsl(300 45% 45%)",
  "hsl(50 75% 45%)",
];

function SankeyNodeRenderer(props: any) {
  const { x, y, width, height, index, payload } = props;
  const isCompany = payload.depth === 0;
  const color = isCompany
    ? COMPANY_COLORS[index % COMPANY_COLORS.length]
    : "hsl(var(--muted-foreground) / 0.5)";

  return (
    <Layer key={`sankey-node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.9}
        rx={3}
      />
      <text
        x={isCompany ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isCompany ? "end" : "start"}
        dominantBaseline="central"
        className="fill-foreground"
        style={{ fontSize: 11, fontWeight: isCompany ? 500 : 400 }}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

export default function Affiliations() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(new Set());

  // Extract all companies and standards that have author data
  const { allCompanies, allStandardNames } = useMemo(() => {
    if (!standards) return { allCompanies: [], allStandardNames: [] };
    const companies = new Set<string>();
    const stdNames = new Set<string>();
    for (const s of standards) {
      const authors = (s as any).authors as Author[] | undefined;
      if (!authors?.length) continue;
      stdNames.add(s.title);
      for (const a of authors) {
        if (a.company?.trim()) companies.add(a.company.trim());
      }
    }
    return {
      allCompanies: [...companies].sort(),
      allStandardNames: [...stdNames].sort(),
    };
  }, [standards]);

  const toggleCompany = (c: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  };

  const toggleStandard = (s: string) => {
    setSelectedStandards((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedCompanies(new Set());
    setSelectedStandards(new Set());
  };

  const hasFilters = selectedCompanies.size > 0 || selectedStandards.size > 0;

  const sankeyData = useMemo(() => {
    if (!standards) return null;

    const companyStandardMap: Record<string, Set<string>> = {};

    for (const s of standards) {
      const authors = (s as any).authors as Author[] | undefined;
      if (!authors?.length) continue;

      // If filtering by standard, skip non-matching
      if (selectedStandards.size > 0 && !selectedStandards.has(s.title)) continue;

      for (const a of authors) {
        const company = a.company?.trim();
        if (!company) continue;

        // If filtering by company, skip non-matching
        if (selectedCompanies.size > 0 && !selectedCompanies.has(company)) continue;

        if (!companyStandardMap[company]) companyStandardMap[company] = new Set();
        companyStandardMap[company].add(s.title);
      }
    }

    const companies = Object.keys(companyStandardMap).sort();
    if (companies.length === 0) return null;

    const standardNames = [...new Set(companies.flatMap((c) => [...companyStandardMap[c]]))].sort();

    const nodes = [
      ...companies.map((c) => ({ name: c })),
      ...standardNames.map((s) => ({ name: s })),
    ];

    const links: { source: number; target: number; value: number }[] = [];
    for (const company of companies) {
      const companyIdx = companies.indexOf(company);
      for (const stdName of companyStandardMap[company]) {
        const stdIdx = companies.length + standardNames.indexOf(stdName);
        const standard = standards.find((s) => s.title === stdName);
        const count = ((standard as any)?.authors as Author[] || []).filter(
          (a) => a.company?.trim() === company
        ).length;
        links.push({ source: companyIdx, target: stdIdx, value: count });
      }
    }

    return { nodes, links };
  }, [standards, selectedCompanies, selectedStandards]);

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

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ lineHeight: "1.15" }}>
            Company Affiliations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Which companies are involved in which AI standards, based on spec authorship.
          </p>
        </div>

        {/* Filters */}
        {allCompanies.length > 0 && (
          <div className="space-y-3 mb-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Companies</span>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allCompanies.map((c) => (
                  <Badge
                    key={c}
                    variant={selectedCompanies.has(c) ? "default" : "outline"}
                    className="cursor-pointer text-xs transition-all hover:shadow-sm active:scale-[0.97]"
                    onClick={() => toggleCompany(c)}
                  >
                    {c}
                    {selectedCompanies.has(c) && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Standards</span>
              <div className="flex flex-wrap gap-1.5">
                {allStandardNames.map((s) => (
                  <Badge
                    key={s}
                    variant={selectedStandards.has(s) ? "default" : "outline"}
                    className="cursor-pointer text-xs transition-all hover:shadow-sm active:scale-[0.97]"
                    onClick={() => toggleStandard(s)}
                  >
                    {s}
                    {selectedStandards.has(s) && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-96 w-full" />
          </div>
        ) : !sankeyData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              {hasFilters ? "No results match the current filters." : "No author affiliation data available yet."}
            </p>
            {!hasFilters && (
              <p className="text-xs text-muted-foreground mt-1">
                Use "Enrich with AI" on standards to populate author data.
              </p>
            )}
            {hasFilters && (
              <button onClick={clearFilters} className="text-sm text-primary hover:underline mt-2">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 overflow-x-auto">
            <Sankey
              width={900}
              height={Math.max(400, sankeyData.nodes.length * 28)}
              data={sankeyData}
              node={<SankeyNodeRenderer />}
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
