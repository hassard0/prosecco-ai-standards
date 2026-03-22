import { useState, useMemo, useCallback } from "react";
import { useStandards } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

// Zalando-style: 4 quadrants, 3 concentric rings
// Quadrants are tag-based categories
const QUADRANT_DEFS = [
  { name: "Protocols", tags: ["protocol", "protocols", "agents", "messaging"], angle: 0 },
  { name: "Governance", tags: ["governance", "safety", "ethics", "regulation", "policy", "risk"], angle: 1 },
  { name: "Data & Models", tags: ["data", "models", "training", "ml", "format", "interoperability"], angle: 2 },
  { name: "Infrastructure", tags: ["infrastructure", "deployment", "runtime", "cloud", "compute", "security", "identity"], angle: 3 },
];

const RINGS = [
  { status: "Approved" as const, label: "Approved", color: "hsl(152 60% 42%)" },
  { status: "Draft" as const, label: "Draft", color: "hsl(220 60% 55%)" },
  { status: "Emerging" as const, label: "Emerging", color: "hsl(38 80% 55%)" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function assignQuadrant(standard: Standard): number {
  const tags = (standard.tags || []).map((t) => t.toLowerCase());
  for (let qi = 0; qi < QUADRANT_DEFS.length; qi++) {
    if (QUADRANT_DEFS[qi].tags.some((qt) => tags.includes(qt))) return qi;
  }
  // Fallback: hash-based
  return hashString(standard.id) % 4;
}

interface Blip {
  standard: Standard;
  x: number;
  y: number;
  color: string;
  quadrant: number;
  ring: number;
  index: number;
}

export default function Radar() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeQuadrant, setActiveQuadrant] = useState<number | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!standards) return [];
    // Exclude Backlog from public radar
    const pub = standards.filter((s) => s.status !== "Backlog");
    const q = searchQuery.toLowerCase().trim();
    if (!q) return pub;
    return pub.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.acronym && s.acronym.toLowerCase().includes(q))
    );
  }, [standards, searchQuery]);

  const blips = useMemo(() => {
    const result: Blip[] = [];
    let globalIndex = 0;

    // Group by quadrant and ring
    const grouped: Record<string, Standard[]> = {};
    for (const s of filtered) {
      const qi = assignQuadrant(s);
      const ri = RINGS.findIndex((r) => r.status === s.status);
      if (ri === -1) continue;
      const key = `${qi}-${ri}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }

    const cx = 500, cy = 500;
    const maxR = 420;
    const ringWidths = [140, 140, 140]; // inner to outer

    for (const s of filtered) {
      const qi = assignQuadrant(s);
      const ri = RINGS.findIndex((r) => r.status === s.status);
      if (ri === -1) continue;

      const key = `${qi}-${ri}`;
      const siblings = grouped[key];
      const sibIdx = siblings.indexOf(s);

      // Quadrant angle range (each 90°)
      // Q0=bottom-right, Q1=bottom-left, Q2=top-left, Q3=top-right (Zalando convention)
      const quadrantStartAngle = qi * (Math.PI / 2);
      const padding = 0.08;
      const sectorAngle = (Math.PI / 2) - padding * 2;
      const angleStep = sectorAngle / Math.max(siblings.length + 1, 2);
      const angle = quadrantStartAngle + padding + angleStep * (sibIdx + 1);

      // Ring radius band
      let innerR = 0;
      for (let r = 0; r < ri; r++) innerR += ringWidths[r];
      const outerR = innerR + ringWidths[ri];
      const h = hashString(s.id);
      const rPos = innerR + 20 + ((h % 71) / 71) * (outerR - innerR - 40);

      const x = cx + rPos * Math.sin(angle);
      const y = cy - rPos * Math.cos(angle);

      result.push({
        standard: s,
        x,
        y,
        color: RINGS[ri].color,
        quadrant: qi,
        ring: ri,
        index: ++globalIndex,
      });
    }
    return result;
  }, [filtered]);

  const ringRadii = [140, 280, 420];

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-1" style={{ lineHeight: "1.1" }}>
            Tech Radar
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            AI standards plotted by category and maturity — approved at center, emerging at edge.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="w-full aspect-square max-w-3xl mx-auto rounded-full" />
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Radar SVG */}
            <div className="flex-1 min-w-0">
              <svg viewBox="0 0 1000 1000" className="w-full h-auto max-w-3xl mx-auto">
                {/* Background quadrant fills */}
                {[0, 1, 2, 3].map((qi) => {
                  const startAngle = qi * 90 - 90;
                  const isActive = activeQuadrant === null || activeQuadrant === qi;
                  return (
                    <path
                      key={`quad-${qi}`}
                      d={describeArc(500, 500, 420, startAngle, startAngle + 90)}
                      className={isActive ? "fill-muted/30" : "fill-muted/10"}
                      stroke="none"
                      style={{ transition: "fill 200ms ease-out" }}
                      onMouseEnter={() => setActiveQuadrant(qi)}
                      onMouseLeave={() => setActiveQuadrant(null)}
                    />
                  );
                })}

                {/* Rings */}
                {ringRadii.map((r, i) => (
                  <circle
                    key={`ring-${i}`}
                    cx={500}
                    cy={500}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="1"
                  />
                ))}

                {/* Axes */}
                <line x1={500} y1={80} x2={500} y2={920} stroke="currentColor" className="text-border" strokeWidth="1" />
                <line x1={80} y1={500} x2={920} y2={500} stroke="currentColor" className="text-border" strokeWidth="1" />

                {/* Ring labels */}
                {RINGS.map((ring, i) => (
                  <text
                    key={`rlabel-${ring.status}`}
                    x={505}
                    y={500 - ringRadii[i] + 18}
                    className="fill-muted-foreground"
                    fontSize="12"
                    fontWeight="600"
                    opacity={0.7}
                  >
                    {ring.label}
                  </text>
                ))}

                {/* Quadrant labels */}
                {QUADRANT_DEFS.map((q, qi) => {
                  const positions = [
                    { x: 760, y: 960 },  // Q0 bottom-right
                    { x: 30, y: 960 },   // Q1 bottom-left
                    { x: 30, y: 50 },    // Q2 top-left
                    { x: 760, y: 50 },   // Q3 top-right
                  ];
                  return (
                    <text
                      key={`qlabel-${qi}`}
                      x={positions[qi].x}
                      y={positions[qi].y}
                      className="fill-foreground"
                      fontSize="16"
                      fontWeight="700"
                      opacity={activeQuadrant === null || activeQuadrant === qi ? 1 : 0.3}
                      style={{ transition: "opacity 200ms ease-out" }}
                    >
                      {q.name}
                    </text>
                  );
                })}

                {/* Blips */}
                {blips.map((blip) => {
                  const isActive = activeQuadrant === null || activeQuadrant === blip.quadrant;
                  const isHovered = hoveredId === blip.standard.id;
                  return (
                    <g
                      key={blip.standard.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredId(blip.standard.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => navigate(`/standard/${blip.standard.id}`)}
                      opacity={isActive ? 1 : 0.15}
                      style={{ transition: "opacity 200ms ease-out" }}
                    >
                      <circle
                        cx={blip.x}
                        cy={blip.y}
                        r={isHovered ? 14 : 10}
                        fill={blip.color}
                        className="transition-all duration-150"
                      />
                      <text
                        x={blip.x}
                        y={blip.y + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill="white"
                      >
                        {blip.index}
                      </text>
                      {isHovered && (
                        <>
                          <rect
                            x={blip.x + 16}
                            y={blip.y - 14}
                            width={Math.max((blip.standard.acronym || blip.standard.title.slice(0, 25)).length * 7.5 + 16, 60)}
                            height={26}
                            rx={6}
                            className="fill-card stroke-border"
                            strokeWidth="1"
                          />
                          <text
                            x={blip.x + 24}
                            y={blip.y + 1}
                            fontSize="12"
                            className="fill-card-foreground font-medium"
                          >
                            {blip.standard.acronym || blip.standard.title.slice(0, 25)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend table */}
            <div className="lg:w-80 shrink-0 space-y-6">
              {/* Ring legend */}
              <div className="flex items-center gap-4">
                {RINGS.map((ring) => (
                  <div key={ring.status} className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ring.color }} />
                    <span className="text-xs font-medium text-muted-foreground">{ring.label}</span>
                  </div>
                ))}
              </div>

              {/* Blip index by quadrant */}
              {QUADRANT_DEFS.map((q, qi) => {
                const quadBlips = blips.filter((b) => b.quadrant === qi);
                if (quadBlips.length === 0) return null;
                return (
                  <div
                    key={qi}
                    className="space-y-2"
                    onMouseEnter={() => setActiveQuadrant(qi)}
                    onMouseLeave={() => setActiveQuadrant(null)}
                  >
                    <h3 className="text-sm font-semibold text-foreground">{q.name}</h3>
                    <div className="space-y-0.5">
                      {quadBlips.map((b) => (
                        <button
                          key={b.standard.id}
                          className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/50 transition-colors text-xs group active:scale-[0.98]"
                          onMouseEnter={() => setHoveredId(b.standard.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onClick={() => navigate(`/standard/${b.standard.id}`)}
                        >
                          <span
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: b.color }}
                          >
                            {b.index}
                          </span>
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate">
                            {b.standard.acronym ? `${b.standard.acronym} — ` : ""}
                            {b.standard.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

// SVG arc path helper
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
