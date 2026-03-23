import { useMemo } from "react";
import { Sankey, Tooltip, Rectangle, Layer } from "recharts";

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

function MiniSankeyNode(props: any) {
  const { x, y, width, height, index, payload } = props;
  const isCompany = payload.depth === 0;
  const color = isCompany
    ? COMPANY_COLORS[index % COMPANY_COLORS.length]
    : "hsl(var(--muted-foreground) / 0.4)";

  return (
    <Layer key={`mini-sankey-node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.9}
        rx={2}
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

interface Props {
  standardTitle: string;
  authors: Author[];
}

export function MiniAuthorSankey({ standardTitle, authors }: Props) {
  const sankeyData = useMemo(() => {
    const companyMap: Record<string, number> = {};
    for (const a of authors) {
      const company = a.company?.trim();
      if (!company) continue;
      companyMap[company] = (companyMap[company] || 0) + 1;
    }

    const companies = Object.keys(companyMap).sort();
    if (companies.length === 0) return null;

    const nodes = [
      ...companies.map((c) => ({ name: c })),
      { name: standardTitle.length > 30 ? standardTitle.slice(0, 28) + "…" : standardTitle },
    ];

    const targetIdx = companies.length;
    const links = companies.map((c, i) => ({
      source: i,
      target: targetIdx,
      value: companyMap[c],
    }));

    return { nodes, links };
  }, [authors, standardTitle]);

  if (!sankeyData) return null;

  const chartHeight = Math.max(160, sankeyData.nodes.length * 40);

  return (
    <div className="flex justify-center overflow-x-auto">
      <Sankey
        width={640}
        height={chartHeight}
        data={sankeyData}
        node={<MiniSankeyNode />}
        nodePadding={14}
        nodeWidth={8}
        linkCurvature={0.5}
        margin={{ top: 10, right: 160, bottom: 10, left: 160 }}
        link={{ stroke: "hsl(var(--muted-foreground) / 0.10)", strokeOpacity: 0.5 }}
      >
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const data = payload[0].payload;
            if (data.source && data.target) {
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <span className="font-medium">{data.source.name}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="text-muted-foreground">
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
  );
}
