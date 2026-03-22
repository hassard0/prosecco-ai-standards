import { useMemo } from "react";
import { Sankey, Tooltip, Rectangle, Layer } from "recharts";

interface Author {
  name: string;
  company: string;
  role?: string;
  url?: string;
}

function MiniSankeyNode(props: any) {
  const { x, y, width, height, index, payload } = props;
  const isCompany = payload.depth === 0;

  return (
    <Layer key={`mini-sankey-node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isCompany ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.4)"}
        fillOpacity={0.9}
        rx={2}
      />
      <text
        x={isCompany ? x - 4 : x + width + 4}
        y={y + height / 2}
        textAnchor={isCompany ? "end" : "start"}
        dominantBaseline="central"
        className="fill-foreground"
        style={{ fontSize: 10 }}
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

  const chartHeight = Math.max(80, sankeyData.nodes.length * 24);

  return (
    <div className="overflow-x-auto -mx-2">
      <Sankey
        width={460}
        height={chartHeight}
        data={sankeyData}
        node={<MiniSankeyNode />}
        nodePadding={8}
        nodeWidth={5}
        linkCurvature={0.5}
        margin={{ top: 4, right: 120, bottom: 4, left: 120 }}
        link={{ stroke: "hsl(var(--primary) / 0.12)", strokeOpacity: 0.5 }}
      >
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const data = payload[0].payload;
            if (data.source && data.target) {
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-[11px] shadow-md">
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
