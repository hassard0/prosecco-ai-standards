import { useState, useRef, useCallback } from "react";
import { Navigate, Link } from "react-router-dom";
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
import { Plus, Pencil, Trash2, LogOut, ArrowLeft, GripVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminInvite } from "@/components/AdminInvite";
import { AiIngestion } from "@/components/AiIngestion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatusType = "Backlog" | "Emerging" | "Draft" | "Approved";

type StandardForm = {
  title: string;
  acronym: string;
  description: string;
  status: StatusType;
  link: string;
  organization: string;
  tags: string;
};

const empty: StandardForm = {
  title: "", acronym: "", description: "", status: "Backlog",
  link: "", organization: "", tags: "",
};

const COLUMNS: { status: StatusType; label: string; color: string; description: string }[] = [
  { status: "Backlog", label: "Backlog", color: "hsl(270 40% 55%)", description: "Unpublished — drafts, AI-discovered, and work-in-progress" },
  { status: "Emerging", label: "Emerging", color: "hsl(38 80% 55%)", description: "Newly identified, under evaluation" },
  { status: "Draft", label: "Draft", color: "hsl(220 60% 55%)", description: "In active development" },
  { status: "Approved", label: "Approved", color: "hsl(152 60% 42%)", description: "Finalized specification" },
];

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { data: standards, isLoading, error } = useStandards();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StandardForm>(empty);
  const [saving, setSaving] = useState(false);

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<StatusType | null>(null);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <p className="text-muted-foreground text-center">You don't have admin access. Contact an existing admin to get invited.</p>
      <Button variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );

  const openCreate = (status: StatusType = "Backlog") => {
    setEditingId(null);
    setForm({ ...empty, status });
    setDialogOpen(true);
  };

  const openEdit = (s: Standard) => {
    navigate(`/admin/edit/${s.id}`);
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

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: StatusType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: StatusType) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedId) return;

    const standard = standards?.find((s) => s.id === draggedId);
    if (!standard || standard.status === newStatus) {
      setDraggedId(null);
      return;
    }

    // Optimistic: update cache
    qc.setQueryData(["standards"], (old: Standard[] | undefined) =>
      old?.map((s) => (s.id === draggedId ? { ...s, status: newStatus } : s))
    );

    const { error } = await supabase.from("standards").update({ status: newStatus }).eq("id", draggedId);
    if (error) {
      toast({ title: "Error moving card", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["standards"] });
    } else {
      toast({ title: `Moved to ${newStatus}` });
      qc.invalidateQueries({ queryKey: ["standards"] });
    }
    setDraggedId(null);
  };

  const set = (key: keyof StandardForm, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const columnStandards = (status: StatusType) =>
    (standards || []).filter((s) => s.status === status);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
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

      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Tools row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="space-y-2 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">AI Ingestion</h2>
            <p className="text-xs text-muted-foreground">Paste a URL to extract metadata with AI. New standards go to Backlog.</p>
            <AiIngestion />
          </section>
          <section className="space-y-2 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Invite Admins</h2>
            <p className="text-xs text-muted-foreground">Grant admin access or invite new users by email.</p>
            <AdminInvite />
          </section>
        </div>

        {/* Kanban Board */}
        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load standards.
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-24" />
                {[0, 1, 2].map((j) => <Skeleton key={j} className="h-24 w-full rounded-lg" />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const items = columnStandards(col.status);
              return (
                <div
                  key={col.status}
                  className={cn(
                    "flex flex-col min-h-[400px] rounded-lg border bg-muted/20 p-3 transition-all duration-200",
                    dragOverCol === col.status && "ring-2 ring-primary/40 bg-primary/5"
                  )}
                  onDragOver={(e) => handleDragOver(e, col.status)}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={(e) => handleDrop(e, col.status)}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <span className="ml-auto text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {items.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => openCreate(col.status)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground mb-3 px-1">{col.description}</p>

                  {/* Cards */}
                  <div className="space-y-2 flex-1">
                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-background/50 p-6 text-center">
                        <p className="text-xs text-muted-foreground">Drop standards here</p>
                      </div>
                    ) : (
                      items.map((s) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, s.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={cn(
                            "group rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-150",
                            "hover:shadow-md hover:border-primary/20",
                            draggedId === s.id && "opacity-40 scale-95"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="font-medium text-xs text-card-foreground">{s.title}</span>
                                {s.acronym && (
                                  <span className="px-1 py-0.5 text-[9px] font-semibold uppercase rounded bg-primary/10 text-primary">
                                    {s.acronym}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {s.description}
                              </p>
                              {s.tags && s.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {s.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="px-1 py-0.5 text-[9px] rounded bg-muted text-muted-foreground">
                                      {tag}
                                    </span>
                                  ))}
                                  {s.tags.length > 3 && (
                                    <span className="text-[9px] text-muted-foreground">+{s.tags.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEdit(s)}
                                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => handleDelete(s.id)}
                                className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
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
