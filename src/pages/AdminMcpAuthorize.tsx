import { useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function buildErrorRedirect(redirectUri: string, error: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export default function AdminMcpAuthorize() {
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading, hasTeamAccess } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const clientId = params.get("client_id")?.trim() || "";
  const redirectUri = params.get("redirect_uri")?.trim() || "";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge")?.trim() || "";
  const codeChallengeMethod = params.get("code_challenge_method")?.trim() || "plain";
  const scope = params.get("scope")?.trim() || "mcp";
  const responseType = params.get("response_type")?.trim() || "";

  const isValidRequest = Boolean(
    clientId &&
      redirectUri &&
      codeChallenge &&
      responseType === "code" &&
      codeChallengeMethod === "S256"
  );

  const redirectBack = encodeURIComponent(`${location.pathname}${location.search}`);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">Loading authorization…</div>;
  }

  if (!user) {
    return <Navigate to={`/auth?redirect=${redirectBack}`} replace />;
  }

  const handleApprove = async () => {
    if (!isValidRequest) return;
    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("admin-mcp-auth", {
      headers: { "x-oauth-path": "/approve" },
      body: {
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
      },
    });

    if (error || !data?.redirect_to) {
      toast({
        title: "Authorization failed",
        description: error?.message || data?.error_description || "Could not approve this client.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    window.location.href = data.redirect_to;
  };

  const handleDeny = () => {
    if (!redirectUri) return;
    window.location.href = buildErrorRedirect(redirectUri, "access_denied", state);
  };

  if (!hasTeamAccess) {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need contributor or admin access to authorize the admin MCP server.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild variant="outline">
              <Link to="/">Back to site</Link>
            </Button>
            {redirectUri ? (
              <Button variant="destructive" onClick={handleDeny}>Deny access</Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-primary">Admin MCP Authorization</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Approve ChatGPT access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This grants the connected client access to the authenticated admin MCP server using your team permissions.
        </p>

        {!isValidRequest ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            This authorization request is invalid or missing required OAuth PKCE parameters.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border bg-background p-4 text-sm">
              <div className="grid gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client ID</p>
                  <p className="mt-1 break-all font-mono text-foreground">{clientId}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Redirect URI</p>
                  <p className="mt-1 break-all font-mono text-foreground">{redirectUri}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requested scope</p>
                  <p className="mt-1 text-foreground">{scope}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Only approve if you initiated this ChatGPT connection and trust the redirect URI above.
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleDeny} disabled={!redirectUri || submitting}>
            Deny
          </Button>
          <Button onClick={handleApprove} disabled={!isValidRequest || submitting}>
            {submitting ? "Approving…" : "Approve access"}
          </Button>
        </div>
      </div>
    </div>
  );
}
