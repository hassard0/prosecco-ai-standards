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
import { Sparkles, Loader2 } from "lucide-react";

interface ExtractedStandard {
  title: string;
  acronym: string;
  description: string;
  organization: string;
  status: "Backlog" | "Emerging" | "Draft" | "Approved";
  tags: string[];
  link: string;
}

export function AiIngestion() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedStandard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Editable form state derived from AI extraction
  const [form, setForm] = useState<ExtractedStandard & { tagsStr: string }>({
    title: "", acronym: "", description: "", organization: "",
    status: "Backlog", tags: [], link: "", tagsStr: "",
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
      });
      setDialogOpen(true);
    } catch (err) {
      toast({ title: "Error", description: "Failed to analyze URL", variant: "destructive" });
    }
    setAnalyzing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      title: form.title,
      acronym: form.acronym || null,
      description: form.description,
      status: form.status,
      link: form.link || null,
      organization: form.organization || null,
      tags: form.tagsStr ? form.tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [],
    };

    const { error } = await supabase.from("standards").insert(payload);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Standard added!" });
      qc.invalidateQueries({ queryKey: ["standards"] });
      setDialogOpen(false);
      setUrl("");
      setExtracted(null);
    }
    setSaving(false);
  };

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

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
        <DialogContent className="sm:max-w-lg">
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
            <Button onClick={handleSave} className="w-full" disabled={saving || !form.title || !form.description}>
              {saving ? "Saving…" : "Add to Directory"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
