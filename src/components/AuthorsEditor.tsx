import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

export interface Author {
  name: string;
  company: string;
  role?: string;
  url?: string;
}

interface Props {
  authors: Author[];
  onChange: (authors: Author[]) => void;
}

export function AuthorsEditor({ authors, onChange }: Props) {
  const add = () => onChange([...authors, { name: "", company: "", role: "", url: "" }]);
  const remove = (i: number) => onChange(authors.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<Author>) =>
    onChange(authors.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  return (
    <section className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Authors & Affiliations</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Spec editors, chairs, and contributors</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Author
        </Button>
      </div>

      {authors.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No authors added yet. Use "Enrich with AI" or add manually.
        </p>
      )}

      {authors.map((author, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              value={author.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Jane Smith"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Company</Label>
            <Input
              value={author.company}
              onChange={(e) => update(i, { company: e.target.value })}
              placeholder="Google"
              className="h-8 text-sm"
            />
          </div>
          <div className="pt-5">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Role</Label>
            <Input
              value={author.role || ""}
              onChange={(e) => update(i, { role: e.target.value })}
              placeholder="Editor"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Profile URL</Label>
            <Input
              type="url"
              value={author.url || ""}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
        </div>
      ))}
    </section>
  );
}
