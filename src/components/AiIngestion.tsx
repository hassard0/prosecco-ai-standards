import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, Trash2, ExternalLink } from "lucide-react";

interface ResourceLink {
  type: string;
  label: string;
  url: string;
}

interface ExtractedStandard {
  title: string;
  acronym: string;
  description: string;
  organization: string;
  status: "Backlog" | "Emerging" | "Draft" | "Approved";
  tags: string[];
  link: string;
  resources?: ResourceLink[];
  authors?: { name: string; company: string; role?: string; url?: string }[];
}

const RESOURCE_TYPES = [
  "primary_spec", "mailing_list", "github", "working_group",
  "reference_impl", "documentation", "blog", "video",
  "discord", "slack", "other",
];

export function AiIngestion() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedStandard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<ExtractedStandard & { tagsStr: string }>({
    title: "", acronym: "", description: "", organization: "",
    status: "Backlog", tags: [], link: "", tagsStr: "", resources: [],
  });

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-standard", {
        body: { url: url.trim() },
      });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setAnalyzing(false);
        return;
      }

      if (!data?.success) {
        toast({ title: "Analysis failed", description: data?.error ?? "Unknown error", variant: "destructive" });
        setAnalyzing(false);
        return;
      }

      const d = data.data as ExtractedStandard;
      setExtracted(d);
      setForm({
        ...d,
        tagsStr: d.tags.join(", "),
        resources: d.resources || [],
      });
      setDialogOpen(true);
    } catch (err) {
      toast({ title: "Error", description: "Failed to analyze URL", variant: "destructive" });
    }
    setAnalyzing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const resources = (form.resources || []).filter((r) => r.url.trim());
    const payload = {
      title: form.title,
      acronym: form.acronym || null,
      description: form.description,
      status: form.status,
      link: form.link || null,
      organization: form.organization || null,
      tags: form.tagsStr ? form.tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [],
      authors: (extracted?.authors || []).filter((a) => a.name?.trim()),
      resources: resources as any,
    };

    const { data: insertData, error } = await supabase.from("standards").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({ title: "Standard added!", description: "Generating summary…" });
    qc.invalidateQueries({ queryKey: ["standards"] });
    setDialogOpen(false);
    setUrl("");
    setExtracted(null);
    setSaving(false);

    // Auto-generate summary in the background
    if (insertData?.id && resources.length > 0) {
      try {
        await supabase.functions.invoke("summarize-mailing-list", {
          body: { standard_id: insertData.id },
        });
        toast({ title: "Summary generated", description: "AI summary is now available on the standard's detail page." });
        qc.invalidateQueries({ queryKey: ["summaries"] });
      } catch {
        // Non-critical — don't block
        toast({ title: "Summary generation failed", description: "You can generate it later from the detail page.", variant: "destructive" });
      }
    }
  };

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const updateResource = (index: number, field: keyof ResourceLink, value: string) => {
    setForm((f) => {
      const resources = [...(f.resources || [])];
      resources[index] = { ...resources[index], [field]: value };
      return { ...f, resources };
    });
  };

  const removeResource = (index: number) => {
    setForm((f) => ({
      ...f,
      resources: (f.resources || []).filter((_, i) => i !== index),
    }));
  };

  const addResource = () => {
    setForm((f) => ({
      ...f,
      resources: [...(f.resources || []), { type: "other", label: "", url: "" }],
    }));
  };

  return (
    <>
      <form onSubmit={handleAnalyze} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            type="url"
            placeholder="https://example.com/ai-standard"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="h-9"
          />
        </div>
        <Button type="submit" size="sm" disabled={analyzing}>
          {analyzing ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyzing…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1" /> Analyze URL</>
          )}
        </Button>
      </form>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI-Extracted Standard
            </DialogTitle>
            <DialogDescription>
              Review and edit the AI-extracted metadata before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Acronym</Label>
                <Input value={form.acronym} onChange={(e) => set("acronym", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Backlog">Backlog</SelectItem>
                    <SelectItem value="Emerging">Emerging</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Organization</Label>
                <Input value={form.organization} onChange={(e) => set("organization", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input type="url" value={form.link} onChange={(e) => set("link", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tagsStr} onChange={(e) => set("tagsStr", e.target.value)} />
            </div>

            {/* Resources section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Resources ({(form.resources || []).length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addResource} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {(form.resources || []).length === 0 && (
                <p className="text-xs text-muted-foreground">No resources extracted. Add some manually or they'll be picked up by AI enrichment.</p>
              )}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(form.resources || []).map((resource, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2">
                    <Select value={resource.type} onValueChange={(v) => updateResource(i, "type", v)}>
                      <SelectTrigger className="h-8 w-[130px] text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={resource.label}
                      onChange={(e) => updateResource(i, "label", e.target.value)}
                      placeholder="Label"
                      className="h-8 text-xs flex-1 min-w-0"
                    />
                    <Input
                      value={resource.url}
                      onChange={(e) => updateResource(i, "url", e.target.value)}
                      placeholder="URL"
                      className="h-8 text-xs flex-1 min-w-0"
                    />
                    <div className="flex gap-1 shrink-0">
                      {resource.url && (
                        <a href={resource.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-background hover:bg-accent transition-colors">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeResource(i)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving || !form.title || !form.description}>
              {saving ? "Saving…" : "Add to Directory"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
