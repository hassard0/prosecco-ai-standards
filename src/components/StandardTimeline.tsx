import { Calendar, Rocket, FileText, Users, Flag, Clock, Star, Circle } from "lucide-react";

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  type: "release" | "draft" | "decision" | "meeting" | "deadline" | "milestone" | "other";
}

const TYPE_CONFIG: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  release: { icon: Rocket, color: "hsl(152 60% 32%)", bg: "hsl(152 60% 42% / 0.12)" },
  draft: { icon: FileText, color: "hsl(220 60% 45%)", bg: "hsl(220 60% 55% / 0.12)" },
  decision: { icon: Flag, color: "hsl(38 80% 40%)", bg: "hsl(38 80% 55% / 0.12)" },
  meeting: { icon: Users, color: "hsl(270 40% 40%)", bg: "hsl(270 40% 55% / 0.12)" },
  deadline: { icon: Clock, color: "hsl(0 60% 45%)", bg: "hsl(0 60% 50% / 0.12)" },
  milestone: { icon: Star, color: "hsl(200 60% 40%)", bg: "hsl(200 60% 50% / 0.12)" },
  other: { icon: Circle, color: "hsl(0 0% 45%)", bg: "hsl(0 0% 50% / 0.12)" },
};

function formatDate(dateStr: string) {
  try {
    if (/^\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return new Date(dateStr + "-01").toLocaleDateString("en-US", { year: "numeric", month: "short" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function StandardTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
      </div>

      <div className="relative ml-3">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {events.map((event, i) => {
            const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other;
            const Icon = config.icon;

            return (
              <div key={i} className="relative flex gap-3 group">
                {/* Dot */}
                <div
                  className="relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: config.bg }}
                >
                  <Icon className="h-2.5 w-2.5" style={{ color: config.color }} />
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{event.title}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(event.date)}</span>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
