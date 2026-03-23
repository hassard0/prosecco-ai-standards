import { useState, useMemo } from "react";
import { useStandards } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AggregateTimeline } from "@/components/AggregateTimeline";

// Quadrants designed around the actual standards in the directory
const QUADRANT_DEFS = [
  { name: "Agent Communication" },
  { name: "Commerce & Payments" },
  { name: "Discovery & Config" },
  { name: "Security & Identity" },
];

// Zalando rings: Adopt (center) → Trial → Assess → Hold (outer)
const RINGS = [
  { label: "Adopt", status: "Approved" as const, color: "hsl(152 60% 42%)", desc: "We strongly recommend adoption" },
  { label: "Trial", status: "Draft" as const, color: "hsl(220 60% 55%)", desc: "Worth trying in projects" },
  { label: "Assess", status: "Emerging" as const, color: "hsl(38 80% 55%)", desc: "Worth exploring with the goal of understanding" },
  { label: "Hold", status: "Backlog" as const, color: "hsl(0 50% 50%)", desc: "Proceed with caution" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Smart quadrant assignment: uses tag priority + title heuristics to spread standards
function assignQuadrant(standard: Standard): number {
  const tags = (standard.tags || []).map((t) => t.toLowerCase());
  const title = standard.title.toLowerCase();
  const acronym = (standard.acronym || "").toLowerCase();

  // Q1: Commerce & Payments — anything payment/commerce related
  if (tags.includes("payments") || tags.includes("commerce") || title.includes("payment") || title.includes("commerce") || title.includes("x402")) {
    return 1;
  }

  // Q3: Security & Identity — security, identity, auth, access
  if (tags.includes("security") || tags.includes("identity") || title.includes("identity") || title.includes("access") || title.includes("auth")) {
    return 3;
  }

  // Q2: Discovery & Config — discovery, config, metadata, format files
  if (tags.includes("api") || tags.includes("standard") || tags.includes("format") ||
      title.includes("llms.txt") || title.includes("agents.json") || title.includes("agents.md") ||
      acronym === "mcp" || title.includes("context protocol") || title.includes("discovery")) {
    return 2;
  }

  // Q0: Agent Communication — agent protocols, messaging, interaction
  if (tags.includes("agents") || tags.includes("protocol") || title.includes("agent")) {
    return 0;
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

const SIZE = 1000;
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_R = 420;
const RING_RADII = [105, 210, 315, 420]; // 4 rings

export default function Radar() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeQuadrant, setActiveQuadrant] = useState<number | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!standards) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return standards;
    return standards.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.acronym && s.acronym.toLowerCase().includes(q))
    );
  }, [standards, searchQuery]);

  const blips = useMemo(() => {
    const result: Blip[] = [];
    let globalIndex = 0;

    // Group by quadrant+ring for spacing
    const grouped: Record<string, Standard[]> = {};
    for (const s of filtered) {
      const qi = assignQuadrant(s);
      const ri = RINGS.findIndex((r) => r.status === s.status);
      if (ri === -1) continue;
      const key = `${qi}-${ri}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }

    for (const s of filtered) {
      const qi = assignQuadrant(s);
      const ri = RINGS.findIndex((r) => r.status === s.status);
      if (ri === -1) continue;

      const key = `${qi}-${ri}`;
      const siblings = grouped[key];
      const sibIdx = siblings.indexOf(s);

      // Quadrant: Q0=bottom-right (0-90°), Q1=bottom-left (90-180°), Q2=top-left (180-270°), Q3=top-right (270-360°)
      const quadStartAngle = qi * (Math.PI / 2);
      const padding = 0.12;
      const sectorAngle = Math.PI / 2 - padding * 2;
      const angleStep = sectorAngle / Math.max(siblings.length + 1, 2);
      const angle = quadStartAngle + padding + angleStep * (sibIdx + 1);

      // Ring radius band
      const innerR = ri === 0 ? 30 : RING_RADII[ri - 1] + 8;
      const outerR = RING_RADII[ri] - 8;
      const h = hashString(s.id);
      const rPos = innerR + ((h % 100) / 100) * (outerR - innerR);

      const x = CX + rPos * Math.sin(angle);
      const y = CY - rPos * Math.cos(angle);

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

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to directory
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1" style={{ lineHeight: "1.1" }}>
            AI Standards Radar
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Standards plotted by category and recommendation — adopt at center, hold at edge.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="w-full aspect-square max-w-3xl mx-auto rounded-full" />
        ) : (
          <div className="flex flex-col xl:flex-row gap-8">
            {/* Radar SVG + Legend */}
            <div className="flex-1 min-w-0 flex flex-col lg:flex-row gap-8">
            <div className="flex-1 min-w-0">
              <svg viewBox="0 0 1000 1000" className="w-full h-auto max-w-3xl mx-auto">
                {/* Quadrant background fills */}
                {[0, 1, 2, 3].map((qi) => {
                  const startAngle = qi * 90 - 90;
                  const isActive = activeQuadrant === null || activeQuadrant === qi;
                  return (
                    <path
                      key={`quad-${qi}`}
                      d={describeArc(CX, CY, MAX_R, startAngle, startAngle + 90)}
                      className={isActive ? "fill-muted/30" : "fill-muted/10"}
                      stroke="none"
                      style={{ transition: "fill 200ms ease-out", cursor: "pointer" }}
                      onMouseEnter={() => setActiveQuadrant(qi)}
                      onMouseLeave={() => setActiveQuadrant(null)}
                    />
                  );
                })}

                {/* Ring circles */}
                {RING_RADII.map((r, i) => (
                  <circle
                    key={`ring-${i}`}
                    cx={CX}
                    cy={CY}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="1"
                    strokeDasharray={i === RING_RADII.length - 1 ? "none" : "none"}
                  />
                ))}

                {/* Cross axes */}
                <line x1={CX} y1={CY - MAX_R} x2={CX} y2={CY + MAX_R} stroke="currentColor" className="text-border" strokeWidth="1" />
                <line x1={CX - MAX_R} y1={CY} x2={CX + MAX_R} y2={CY} stroke="currentColor" className="text-border" strokeWidth="1" />

                {/* Ring labels — placed at top of each ring */}
                {RINGS.map((ring, i) => (
                  <text
                    key={`rlabel-${ring.label}`}
                    x={CX + 6}
                    y={CY - RING_RADII[i] + 16}
                    className="fill-muted-foreground"
                    fontSize="11"
                    fontWeight="600"
                    opacity={0.6}
                  >
                    {ring.label}
                  </text>
                ))}

                {/* Quadrant labels */}
                {QUADRANT_DEFS.map((q, qi) => {
                  const positions = [
                    { x: 740, y: 960 },
                    { x: 30, y: 960 },
                    { x: 30, y: 50 },
                    { x: 740, y: 50 },
                  ];
                  return (
                    <text
                      key={`qlabel-${qi}`}
                      x={positions[qi].x}
                      y={positions[qi].y}
                      className="fill-foreground"
                      fontSize="15"
                      fontWeight="700"
                      opacity={activeQuadrant === null || activeQuadrant === qi ? 1 : 0.25}
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
                      opacity={isActive ? 1 : 0.12}
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
                        fontSize="9"
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
                            width={Math.max((blip.standard.acronym || blip.standard.title.slice(0, 30)).length * 7 + 20, 70)}
                            height={26}
                            rx={6}
                            className="fill-card stroke-border"
                            strokeWidth="1"
                          />
                          <text
                            x={blip.x + 26}
                            y={blip.y + 1}
                            fontSize="11"
                            className="fill-card-foreground font-medium"
                          >
                            {blip.standard.acronym || blip.standard.title.slice(0, 30)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="lg:w-80 shrink-0 space-y-6">
              {/* Ring legend */}
              <div className="space-y-2">
                {RINGS.map((ring) => (
                  <div key={ring.label} className="flex items-start gap-2">
                    <div className="h-3 w-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ring.color }} />
                    <div>
                      <span className="text-xs font-semibold text-foreground">{ring.label}</span>
                      <p className="text-[10px] text-muted-foreground leading-tight">{ring.desc}</p>
                    </div>
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
