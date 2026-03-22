import { useState, useMemo } from "react";
import { useStandards, useTags } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

const RINGS = [
  { status: "Emerging" as const, label: "Emerging", radius: 0.95, color: "hsl(38 80% 55%)" },
  { status: "Draft" as const, label: "Draft", radius: 0.62, color: "hsl(220 60% 55%)" },
  { status: "Approved" as const, label: "Approved", radius: 0.3, color: "hsl(152 60% 42%)" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getBlipPosition(standard: Standard, index: number, total: number, ringRadius: number, prevRadius: number) {
  const h = hashString(standard.id);
  const angleSector = (2 * Math.PI) / Math.max(total, 1);
  const angle = angleSector * index + (h % 100) / 100 * angleSector * 0.6;
  const minR = prevRadius + 0.04;
  const maxR = ringRadius - 0.02;
  const r = minR + ((h % 73) / 73) * (maxR - minR);
  return { x: 50 + r * 50 * Math.cos(angle), y: 50 + r * 50 * Math.sin(angle) };
}

export default function Radar() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: standards, isLoading } = useStandards();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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
    const result: Array<{ standard: Standard; x: number; y: number; color: string }> = [];
    for (const ring of RINGS) {
      const ringStandards = filtered.filter((s) => s.status === ring.status);
      const prevRing = RINGS.find((r) => {
        const idx = RINGS.indexOf(r);
        return idx === RINGS.indexOf(ring) - 1;
      });
      const prevRadius = prevRing ? prevRing.radius - (prevRing.radius - (RINGS[RINGS.indexOf(ring) - 2]?.radius || 0)) : 0;
      const innerRadius = ring === RINGS[0] ? RINGS[1].radius : ring === RINGS[1] ? RINGS[2].radius : 0;
      ringStandards.forEach((s, i) => {
        const pos = getBlipPosition(s, i, ringStandards.length, ring.radius, innerRadius);
        result.push({ standard: s, ...pos, color: ring.color });
      });
    }
    return result;
  }, [filtered]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-1" style={{ lineHeight: "1.1" }}>
            Tech Radar
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            A radar view of AI standards by maturity — from emerging proposals at the edge to approved specs at the center.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="w-full aspect-square max-w-2xl mx-auto rounded-full" />
        ) : (
          <div className="relative w-full max-w-2xl mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-auto">
              {/* Rings */}
              {RINGS.map((ring) => (
                <circle
                  key={ring.status}
                  cx="50"
                  cy="50"
                  r={ring.radius * 50}
                  fill="none"
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth="0.2"
                />
              ))}

              {/* Cross hairs */}
              <line x1="50" y1={50 - RINGS[0].radius * 50} x2="50" y2={50 + RINGS[0].radius * 50} stroke="currentColor" className="text-border" strokeWidth="0.1" />
              <line x1={50 - RINGS[0].radius * 50} y1="50" x2={50 + RINGS[0].radius * 50} y2="50" stroke="currentColor" className="text-border" strokeWidth="0.1" />

              {/* Ring labels */}
              {RINGS.map((ring) => (
                <text
                  key={`label-${ring.status}`}
                  x="50"
                  y={50 - ring.radius * 50 + 2.5}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="1.6"
                  fontWeight="600"
                >
                  {ring.label}
                </text>
              ))}

              {/* Blips */}
              {blips.map(({ standard, x, y, color }) => (
                <g
                  key={standard.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredId(standard.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => navigate(`/standard/${standard.id}`)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={hoveredId === standard.id ? 1.8 : 1.2}
                    fill={color}
                    opacity={hoveredId === standard.id ? 1 : 0.85}
                    className="transition-all duration-200"
                  />
                  {hoveredId === standard.id && (
                    <>
                      <rect
                        x={x + 2}
                        y={y - 2.5}
                        width={Math.max((standard.acronym || standard.title).length * 0.85, 6)}
                        height="4"
                        rx="0.8"
                        className="fill-card stroke-border"
                        strokeWidth="0.15"
                      />
                      <text
                        x={x + 2.8}
                        y={y + 0.5}
                        fontSize="2"
                        className="fill-card-foreground font-medium"
                      >
                        {standard.acronym || standard.title.slice(0, 20)}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
              {RINGS.slice().reverse().map((ring) => (
                <div key={ring.status} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ring.color }} />
                  <span className="text-xs text-muted-foreground font-medium">{ring.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground/60">
                    {filtered.filter((s) => s.status === ring.status).length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
