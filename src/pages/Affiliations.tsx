import { useState, useMemo, useRef, useEffect } from "react";
import { normalizeCompany } from "@/lib/normalizeCompany";
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
  const [showUnknown, setShowUnknown] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [standardDropdownOpen, setStandardDropdownOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [standardSearch, setStandardSearch] = useState("");
  const companyRef = useRef<HTMLDivElement>(null);
  const standardRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) setCompanyDropdownOpen(false);
      if (standardRef.current && !standardRef.current.contains(e.target as Node)) setStandardDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        const c = normalizeCompany(a.company);
        companies.add(c);
      }
    }
      const sorted = [...companies].sort();
      return {
        allCompanies: sorted.filter((c) => c !== "Unknown"),
        allStandardNames: [...stdNames].sort(),
        hasUnknown: companies.has("Unknown"),
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
        const company = normalizeCompany(a.company);
        if (company === "Unknown" && !showUnknown) continue;

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
          (a) => normalizeCompany(a.company) === company
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

        {allCompanies.length > 0 && (
          <div className="flex flex-wrap items-start gap-3 mb-6">
            {/* Company dropdown */}
            <div ref={companyRef} className="relative">
              <button
                onClick={() => { setCompanyDropdownOpen(!companyDropdownOpen); setStandardDropdownOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                Companies
                {selectedCompanies.size > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] font-medium">{selectedCompanies.size}</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {companyDropdownOpen && (
                <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search companies…"
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        className="h-7 pl-7 text-xs"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {allCompanies
                      .filter((c) => c.toLowerCase().includes(companySearch.toLowerCase()))
                      .map((c) => (
                        <button
                          key={c}
                          onClick={() => toggleCompany(c)}
                          className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                        >
                          <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${selectedCompanies.has(c) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                            {selectedCompanies.has(c) && <span className="text-primary-foreground text-[9px]">✓</span>}
                          </div>
                          {c}
                        </button>
                      ))}
                    {allCompanies.filter((c) => c.toLowerCase().includes(companySearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No matches</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Standard dropdown */}
            <div ref={standardRef} className="relative">
              <button
                onClick={() => { setStandardDropdownOpen(!standardDropdownOpen); setCompanyDropdownOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                Standards
                {selectedStandards.size > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] font-medium">{selectedStandards.size}</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {standardDropdownOpen && (
                <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search standards…"
                        value={standardSearch}
                        onChange={(e) => setStandardSearch(e.target.value)}
                        className="h-7 pl-7 text-xs"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {allStandardNames
                      .filter((s) => s.toLowerCase().includes(standardSearch.toLowerCase()))
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleStandard(s)}
                          className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                        >
                          <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${selectedStandards.has(s) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                            {selectedStandards.has(s) && <span className="text-primary-foreground text-[9px]">✓</span>}
                          </div>
                          {s}
                        </button>
                      ))}
                    {allStandardNames.filter((s) => s.toLowerCase().includes(standardSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No matches</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected tags + clear */}
            {hasFilters && (
              <>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {[...selectedCompanies].map((c) => (
                    <Badge key={c} variant="default" className="text-xs cursor-pointer active:scale-[0.97]" onClick={() => toggleCompany(c)}>
                      {c} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {[...selectedStandards].map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs cursor-pointer active:scale-[0.97]" onClick={() => toggleStandard(s)}>
                      {s} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
                <button onClick={clearFilters} className="text-xs text-primary hover:underline">
                  Clear all
                </button>
              </>
            )}
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
