import { Plus, X, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const RESOURCE_TYPES = [
  { value: "primary_spec", label: "Primary Spec" },
  { value: "mailing_list", label: "Mailing List" },
  { value: "github", label: "GitHub Repo" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "working_group", label: "Working Group" },
  { value: "reference_impl", label: "Reference Implementation" },
  { value: "documentation", label: "Documentation" },
  { value: "blog", label: "Blog / Article" },
  { value: "video", label: "Video / Talk" },
  { value: "other", label: "Other" },
] as const;

export type ResourceType = typeof RESOURCE_TYPES[number]["value"];

export interface ResourceLink {
  type: ResourceType;
  label: string;
  url: string;
}

interface Props {
  resources: ResourceLink[];
  onChange: (resources: ResourceLink[]) => void;
}

export function ResourceLinksEditor({ resources, onChange }: Props) {
  const add = () => onChange([...resources, { type: "other", label: "", url: "" }]);
  const remove = (i: number) => onChange(resources.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<ResourceLink>) =>
    onChange(resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <section className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Additional Resources</h2>
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add Link
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Link to mailing lists, GitHub repos, working groups, reference implementations, etc.
      </p>

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-xs text-muted-foreground">No additional resources yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((res, i) => (
            <div key={i} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Select value={res.type} onValueChange={(v) => update(i, { type: v as ResourceType })}>
                <SelectTrigger className="w-[160px] shrink-0 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={res.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label"
                className="flex-[1] h-9 text-sm"
              />
              <Input
                type="url"
                value={res.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://…"
                className="flex-[2] h-9 text-sm"
              />
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => remove(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
