import { useState, useEffect } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStandards } from "@/hooks/useStandards";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EnrichmentReviewDialog } from "@/components/EnrichmentReviewDialog";
import { QaReviewDialog, type QaResults } from "@/components/QaReviewDialog";
import { Navigate } from "react-router-dom";
import { TagInput } from "@/components/TagInput";
import { ResourceLinksEditor, type ResourceLink } from "@/components/ResourceLinksEditor";
import { AuthorsEditor, type Author } from "@/components/AuthorsEditor";

type StatusType = "Backlog" | "Emerging" | "Draft" | "Approved";

export default function AdminEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user, hasTeamAccess, loading: authLoading } = useAuth();
  const { data: standards, isLoading } = useStandards();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [acronym, setAcronym] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<StatusType>((searchParams.get("status") as StatusType) || "Backlog");
  const [link, setLink] = useState("");
  const [organization, setOrganization] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [isExpired, setIsExpired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichData, setEnrichData] = useState<any>(null);
  const [enrichReviewOpen, setEnrichReviewOpen] = useState(false);

  useEffect(() => {
    if (isNew || !standards) return;
    const s = standards.find((st) => st.id === id);
    if (!s) return;
    setTitle(s.title);
    setAcronym(s.acronym ?? "");
    setDescription(s.description);
    setStatus(s.status as StatusType);
    setLink(s.link ?? "");
    setOrganization(s.organization ?? "");
    setTags(s.tags ?? []);
    setResources(((s as any).resources as ResourceLink[]) ?? []);
    setAuthors(((s as any).authors as Author[]) ?? []);
    setIsExpired((s as any).is_expired ?? false);
  }, [id, isNew, standards]);

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasTeamAccess) return <Navigate to="/" replace />;

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      acronym: acronym.trim() || null,
      description: description.trim(),
      status,
      link: link.trim() || null,
      organization: organization.trim() || null,
      tags,
      resources: resources.filter((r) => r.url.trim()) as any,
      authors: authors.filter((a) => a.name.trim()) as any,
      is_expired: isExpired,
    };

    const { error } = isNew
      ? await supabase.from("standards").insert(payload)
      : await supabase.from("standards").update(payload).eq("id", id!);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: isNew ? "Standard created" : "Standard updated" });
      qc.invalidateQueries({ queryKey: ["standards"] });
      navigate("/admin");
    }
    setSaving(false);
  };

  const handleEnrich = async () => {
    if (!link.trim()) {
      toast({ title: "Add a link first", description: "AI enrichment requires a URL to analyze.", variant: "destructive" });
      return;
    }
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-standard", {
        body: { url: link.trim() },
      });
      if (error || !data?.success) {
        toast({ title: "Enrichment failed", description: error?.message ?? data?.error ?? "Unknown error", variant: "destructive" });
      } else {
        setEnrichData(data.data);
        setEnrichReviewOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Failed to enrich", variant: "destructive" });
    }
    setEnriching(false);
  };

  const handleAcceptEnrichment = (accepted: Record<string, boolean>) => {
    if (!enrichData) return;
    const d = enrichData;
    if (accepted.title && d.title) setTitle(d.title);
    if (accepted.acronym && d.acronym) setAcronym(d.acronym);
    if (accepted.description && d.description) setDescription(d.description);
    if (accepted.organization && d.organization) setOrganization(d.organization);
    if (accepted.tags && d.tags?.length) {
      setTags((prev) => [...new Set([...prev, ...d.tags])]);
    }
    if (accepted.resources && d.resources?.length) {
      setResources((prev) => [...prev, ...d.resources]);
    }
    if (accepted.authors && d.authors?.length) {
      setAuthors((prev) => [...prev, ...d.authors]);
    }
    setEnrichReviewOpen(false);
    setEnrichData(null);
    toast({ title: "Enrichment applied", description: "Selected fields have been updated." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold text-foreground text-sm">
              {isNew ? "New Standard" : "Edit Standard"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !description.trim()}>
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {isLoading && !isNew ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Core fields */}
            <section className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Standard name" className="text-lg font-medium h-12" />
                </div>
                <div className="space-y-1.5">
                  <Label>Acronym</Label>
                  <Input value={acronym} onChange={(e) => setAcronym(e.target.value)} placeholder="e.g. MCP" className="h-12" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Describe this standard, its purpose, and key details…" className="leading-relaxed" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusType)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
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
                  <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="e.g. Anthropic" />
                </div>
              </div>

              <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <TagInput tags={tags} onChange={setTags} placeholder="Type a tag and press Enter…" />
                </div>

              <div className="space-y-1.5">
                  <Label>Lifecycle</Label>
                  <Select value={isExpired ? "expired" : "active"} onValueChange={(v) => setIsExpired(v === "expired")}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            </section>

            {/* Link + AI Enrichment */}
            <section className="rounded-lg border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Primary Link & AI Enrichment</h2>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Specification URL</Label>
                  <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://spec.example.com" />
                </div>
                <Button variant="secondary" size="sm" onClick={handleEnrich} disabled={enriching || !link.trim()} className="h-9">
                  {enriching ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enriching…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1" /> Enrich with AI</>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                AI will extract metadata from the URL to fill in missing fields.
              </p>
            </section>

            {/* Authors */}
            <AuthorsEditor authors={authors} onChange={setAuthors} />

            {/* Additional Resources */}
            <ResourceLinksEditor resources={resources} onChange={setResources} />
          </>
        )}
      </main>

      {enrichData && (
        <EnrichmentReviewDialog
          open={enrichReviewOpen}
          onOpenChange={setEnrichReviewOpen}
          current={{ title, acronym, description, organization, status, tags, link, resources, authors }}
          proposed={enrichData}
          onAccept={handleAcceptEnrichment}
        />
      )}
    </div>
  );
}
