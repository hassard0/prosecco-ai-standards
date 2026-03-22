import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStandards } from "@/hooks/useStandards";
import type { Standard } from "@/hooks/useStandards";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, LogOut, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

type StandardForm = {
  title: string;
  acronym: string;
  description: string;
  status: "Emerging" | "Draft" | "Approved";
  link: string;
  organization: string;
  tags: string;
};

const empty: StandardForm = { title: "", acronym: "", description: "", status: "Emerging", link: "", organization: "", tags: "" };

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { data: standards, isLoading, error } = useStandards();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StandardForm>(empty);
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <p className="text-muted-foreground text-center">You don't have admin access. Contact an existing admin to get invited.</p>
      <Button variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );

  const openCreate = () => { setEditingId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (s: Standard) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      acronym: s.acronym ?? "",
      description: s.description,
      status: s.status,
      link: s.link ?? "",
      organization: (s as any).organization ?? "",
      tags: s.tags?.join(", ") ?? "",
    });
    setDialogOpen(true);
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
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    };

    const { error } = editingId
      ? await supabase.from("standards").update(payload).eq("id", editingId)
      : await supabase.from("standards").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Updated" : "Created" });
      qc.invalidateQueries({ queryKey: ["standards"] });
      setDialogOpen(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("standards").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["standards"] });
    }
  };

  const set = (key: keyof StandardForm, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold text-foreground">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Standards ({standards?.length ?? 0})</h2>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Standard
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : (
          <div className="space-y-2">
            {standards?.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.title}</span>
                    {s.acronym && <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-primary/10 text-primary">{s.acronym}</span>}
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full border"
                      style={{
                        backgroundColor: s.status === "Approved" ? "hsl(152 60% 42% / 0.1)" : s.status === "Draft" ? "hsl(220 60% 55% / 0.1)" : "hsl(38 80% 55% / 0.1)",
                        color: s.status === "Approved" ? "hsl(152 60% 32%)" : s.status === "Draft" ? "hsl(220 60% 45%)" : "hsl(38 80% 40%)",
                        borderColor: "transparent",
                      }}
                    >{s.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{s.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Standard" : "Add Standard"}</DialogTitle>
            <DialogDescription className="sr-only">{editingId ? "Edit" : "Create"} a standard</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Acronym</Label>
                <Input value={form.acronym} onChange={(e) => set("acronym", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
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
              <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="ai, protocol, agents" />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving || !form.title || !form.description}>
              {saving ? "Saving…" : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
