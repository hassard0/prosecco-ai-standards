import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ApiClient {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
  revoked_at: string | null;
}

export function ApiClientManager() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<{ client_id: string; client_secret: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_clients")
      .select("id, client_id, name, created_at, revoked_at")
      .order("created_at", { ascending: false });
    if (!error && data) setClients(data as ApiClient[]);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const generateId = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "prs_";
    for (let i = 0; i < 20; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const hashSecret = async (secret: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    const clientId = generateId();
    const clientSecret = generateSecret();
    const secretHash = await hashSecret(clientSecret);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }

    const { error } = await supabase.from("api_clients").insert({
      client_id: clientId,
      client_secret_hash: secretHash,
      name: newName.trim(),
      created_by: user.id,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewCredentials({ client_id: clientId, client_secret: clientSecret });
      fetchClients();
    }
    setCreating(false);
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    const { error } = await supabase
      .from("api_clients")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Client deleted" });
      fetchClients();
    }
    setRevokingId(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <section className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Key className="h-4 w-4" /> API Clients
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            OAuth 2.1 credentials for the admin MCP server at <code className="text-xs bg-muted px-1 py-0.5 rounded">admin.prosecco.dev</code>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setCreateOpen(true); setNewName(""); setNewCredentials(null); setShowSecret(false); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Client
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API clients created yet.</p>
      ) : (
        <div className="space-y-1">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{c.client_id}</p>
                </div>
              </div>
              {!c.revoked_at && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={revokingId === c.id}
                  onClick={() => handleRevoke(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {revokingId === c.id ? "Revoking…" : "Revoke"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg" onFocusOutside={(e) => { if (document.hidden) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{newCredentials ? "Client Created" : "New API Client"}</DialogTitle>
            <DialogDescription>
              {newCredentials
                ? "Copy these credentials now — the secret won't be shown again."
                : "Create credentials for the admin MCP server."}
            </DialogDescription>
          </DialogHeader>

          {newCredentials ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Client ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1 break-all">{newCredentials.client_id}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(newCredentials.client_id, "Client ID")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Client Secret</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1 break-all">
                    {showSecret ? newCredentials.client_secret : "•".repeat(40)}
                  </code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(newCredentials.client_secret, "Client Secret")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Usage:</p>
                <p>1. Get a token:</p>
                <code className="block bg-background rounded px-2 py-1.5 text-[11px] break-all whitespace-pre-wrap">
{`curl -X POST https://admin.prosecco.dev/token \\
  -d "grant_type=client_credentials&client_id=${newCredentials.client_id}&client_secret=YOUR_SECRET"`}
                </code>
                <p>2. Call the admin MCP server:</p>
                <code className="block bg-background rounded px-2 py-1.5 text-[11px] break-all whitespace-pre-wrap">
{`curl -X POST https://admin.prosecco.dev \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`}
                </code>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Client name (e.g. 'CI Pipeline', 'My Agent')"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full">
                {creating ? "Creating…" : "Create Client"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
