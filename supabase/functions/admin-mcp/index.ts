import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const signingSecret = Deno.env.get("MCP_SIGNING_SECRET")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
function getServiceSupabase() {
  return createClient(supabaseUrl, serviceRoleKey);
}

// ── JWT verification ──────────────────────────────────────────────
async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigInput = `${parts[0]}.${parts[1]}`;
    // Restore base64url → base64
    const sig64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
    const pad = sig64.length % 4 === 0 ? "" : "=".repeat(4 - (sig64.length % 4));
    const sigBytes = Uint8Array.from(atob(sig64 + pad), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(sigInput));
    if (!valid) return null;

    const body64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bodyPad = body64.length % 4 === 0 ? "" : "=".repeat(4 - (body64.length % 4));
    const payload = JSON.parse(atob(body64 + bodyPad));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── App ───────────────────────────────────────────────────────────
const app = new Hono();

const mcpServer = new McpServer({
  name: "prosecco-admin-mcp",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════
// PUBLIC READ TOOLS (same as main MCP)
// ═══════════════════════════════════════════════════════════════════

mcpServer.tool("list_standards", {
  description: "List AI interoperability standards. Optionally filter by status or tag.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["Backlog", "Emerging", "Draft", "Approved"] },
      tag: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (params: { status?: string; tag?: string; limit?: number }) => {
    const sb = getSupabase();
    let q = sb.from("standards").select("id, title, acronym, description, organization, status, tags, link, updated_at").order("title");
    if (params.status) q = q.eq("status", params.status);
    if (params.tag) q = q.contains("tags", [params.tag]);
    q = q.limit(Math.min(params.limit || 50, 200));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Found ${data?.length ?? 0} standards.\n\n${JSON.stringify(data, null, 2)}` }] };
  },
});

mcpServer.tool("get_standard", {
  description: "Get full details of a standard by ID.",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("*").eq("id", params.id).single();
    if (error || !data) return { content: [{ type: "text" as const, text: `Not found: ${params.id}` }], isError: true };
    const { data: sums } = await sb.from("standard_summaries").select("summary, whats_new, generated_at").eq("standard_id", params.id).order("generated_at", { ascending: false }).limit(1);
    const result: Record<string, unknown> = { ...data, prosecco_url: `https://prosecco.dev/standard/${data.id}` };
    if (sums?.length) { result.latest_summary = sums[0].summary; result.whats_new = sums[0].whats_new; }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
});

mcpServer.tool("search_standards", {
  description: "Search standards by keyword.",
  inputSchema: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] },
  handler: async (params: { query: string }) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("id, title, acronym, description, organization, status, tags, link").order("title");
    if (error) throw new Error(error.message);
    const q = params.query.toLowerCase();
    const matches = (data || []).filter((s) => [s.title, s.acronym, s.description, s.organization].filter(Boolean).join(" ").toLowerCase().includes(q));
    return { content: [{ type: "text" as const, text: `Found ${matches.length} matching "${params.query}".\n\n${JSON.stringify(matches, null, 2)}` }] };
  },
});

mcpServer.tool("get_directory_overview", {
  description: "Get overview stats of the directory.",
  inputSchema: { type: "object" as const, properties: {} },
  handler: async () => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("status, organization, tags").order("title");
    if (error) throw new Error(error.message);
    const sc: Record<string, number> = {}; const orgs = new Set<string>(); const tags = new Set<string>();
    for (const s of data || []) { sc[s.status] = (sc[s.status] || 0) + 1; if (s.organization) orgs.add(s.organization); if (s.tags) for (const t of s.tags) tags.add(t); }
    return { content: [{ type: "text" as const, text: JSON.stringify({ total: data?.length, by_status: sc, organizations: [...orgs].sort(), tags: [...tags].sort() }, null, 2) }] };
  },
});

mcpServer.tool("list_tags", {
  description: "List all tags with counts.",
  inputSchema: { type: "object" as const, properties: {} },
  handler: async () => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("tags");
    if (error) throw new Error(error.message);
    const tc: Record<string, number> = {};
    for (const s of data || []) if (s.tags) for (const t of s.tags) tc[t] = (tc[t] || 0) + 1;
    const sorted = Object.entries(tc).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
    return { content: [{ type: "text" as const, text: JSON.stringify(sorted, null, 2) }] };
  },
});

mcpServer.tool("search_authors", {
  description: "Search authors by name or company.",
  inputSchema: { type: "object" as const, properties: { name: { type: "string" }, company: { type: "string" } } },
  handler: async (params: { name?: string; company?: string }) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("id, title, acronym, authors").order("title");
    if (error) throw new Error(error.message);
    const results: { name: string; company: string; role: string; standards: { id: string; title: string }[] }[] = [];
    const seen = new Map<string, number>();
    for (const s of data || []) {
      const authors = Array.isArray(s.authors) ? s.authors as { name: string; company?: string; role?: string }[] : [];
      for (const a of authors) {
        if (params.name && !a.name.toLowerCase().includes(params.name.toLowerCase())) continue;
        if (params.company && !(a.company || "").toLowerCase().includes(params.company.toLowerCase())) continue;
        const key = `${a.name}||${a.company || ""}`;
        if (seen.has(key)) { results[seen.get(key)!].standards.push({ id: s.id, title: s.title }); }
        else { seen.set(key, results.length); results.push({ name: a.name, company: a.company || "Unknown", role: a.role || "", standards: [{ id: s.id, title: s.title }] }); }
      }
    }
    return { content: [{ type: "text" as const, text: `Found ${results.length} authors.\n\n${JSON.stringify(results, null, 2)}` }] };
  },
});

mcpServer.tool("list_organizations", {
  description: "List organizations with their standards.",
  inputSchema: { type: "object" as const, properties: { name: { type: "string" } } },
  handler: async (params: { name?: string }) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("id, title, organization, status").order("title");
    if (error) throw new Error(error.message);
    const orgs = new Map<string, { id: string; title: string; status: string }[]>();
    for (const s of data || []) { const o = s.organization || "Unknown"; if (params.name && !o.toLowerCase().includes(params.name.toLowerCase())) continue; if (!orgs.has(o)) orgs.set(o, []); orgs.get(o)!.push({ id: s.id, title: s.title, status: s.status }); }
    const sorted = [...orgs.entries()].sort((a, b) => b[1].length - a[1].length).map(([org, stds]) => ({ organization: org, count: stds.length, standards: stds }));
    return { content: [{ type: "text" as const, text: JSON.stringify(sorted, null, 2) }] };
  },
});

// ═══════════════════════════════════════════════════════════════════
// ADMIN WRITE TOOLS
// ═══════════════════════════════════════════════════════════════════

mcpServer.tool("create_standard", {
  description: "Create a new standard in the directory.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Title of the standard" },
      description: { type: "string" },
      acronym: { type: "string" },
      organization: { type: "string" },
      link: { type: "string", description: "URL to the spec" },
      status: { type: "string", enum: ["Backlog", "Emerging", "Draft", "Approved"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["title", "description"],
  },
  handler: async (params: { title: string; description: string; acronym?: string; organization?: string; link?: string; status?: string; tags?: string[] }) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("standards").insert({
      title: params.title,
      description: params.description,
      acronym: params.acronym || null,
      organization: params.organization || null,
      link: params.link || null,
      status: params.status || "Backlog",
      tags: params.tags || [],
    }).select("id, title").single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Created "${data.title}" (${data.id})` }] };
  },
});

mcpServer.tool("update_standard", {
  description: "Update fields on an existing standard.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "UUID of the standard" },
      title: { type: "string" },
      description: { type: "string" },
      acronym: { type: "string" },
      organization: { type: "string" },
      link: { type: "string" },
      status: { type: "string", enum: ["Backlog", "Emerging", "Draft", "Approved"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  },
  handler: async (params: { id: string; [key: string]: unknown }) => {
    const sb = getServiceSupabase();
    const { id, ...updates } = params;
    // Remove undefined values
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) if (v !== undefined) clean[k] = v;
    if (Object.keys(clean).length === 0) return { content: [{ type: "text" as const, text: "No fields to update." }] };
    const { data, error } = await sb.from("standards").update(clean).eq("id", id).select("id, title").single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Updated "${data.title}" (${data.id}). Fields changed: ${Object.keys(clean).join(", ")}` }] };
  },
});

mcpServer.tool("delete_standard", {
  description: "Delete a standard from the directory.",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getServiceSupabase();
    const { data } = await sb.from("standards").select("title").eq("id", params.id).single();
    const { error } = await sb.from("standards").delete().eq("id", params.id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Deleted "${data?.title || params.id}"` }] };
  },
});

mcpServer.tool("enrich_standard", {
  description: "Run AI resource enrichment on a standard (extracts technical links from its spec URL).",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getServiceSupabase();
    const { data: std } = await sb.from("standards").select("id, title, link").eq("id", params.id).single();
    if (!std?.link) return { content: [{ type: "text" as const, text: "Standard has no spec URL to enrich from." }], isError: true };

    const { data, error } = await sb.functions.invoke("analyze-standard", { body: { url: std.link } });
    if (error || !data?.success) return { content: [{ type: "text" as const, text: `Enrichment failed: ${error?.message || data?.error || "unknown"}` }], isError: true };

    const resources = data.data?.resources;
    if (!resources?.length) return { content: [{ type: "text" as const, text: `No new resources found for "${std.title}".` }] };

    await sb.from("standards").update({ resources }).eq("id", params.id);
    return { content: [{ type: "text" as const, text: `Enriched "${std.title}" with ${resources.length} resources.` }] };
  },
});

mcpServer.tool("generate_summary", {
  description: "Generate an AI summary for a standard based on its resources.",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.functions.invoke("summarize-mailing-list", { body: { standard_id: params.id } });
    if (error) return { content: [{ type: "text" as const, text: `Summary generation failed: ${error.message}` }], isError: true };
    const updated = (data?.results || []).filter((r: { status: string }) => r.status === "updated").length;
    return { content: [{ type: "text" as const, text: updated > 0 ? `Summary generated successfully (${updated} source(s) processed).` : "No new summaries generated — sources may already be up to date." }] };
  },
});

// ── Feedback tools ────────────────────────────────────────────────

mcpServer.tool("list_feedback", {
  description: "List pending feedback/flags submitted by the community.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["pending", "reviewed", "dismissed"], description: "Filter by status (default: pending)" },
    },
  },
  handler: async (params: { status?: string }) => {
    const sb = getServiceSupabase();
    const status = params.status || "pending";
    const { data, error } = await sb.from("standard_flags").select("id, standard_id, feedback, status, user_email, admin_notes, created_at").eq("status", status).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Enrich with standard titles
    if (data?.length) {
      const ids = [...new Set(data.map((f) => f.standard_id))];
      const { data: stds } = await sb.from("standards").select("id, title").in("id", ids);
      const titleMap = new Map((stds || []).map((s) => [s.id, s.title]));
      const enriched = data.map((f) => ({ ...f, standard_title: titleMap.get(f.standard_id) || "Unknown" }));
      return { content: [{ type: "text" as const, text: `Found ${enriched.length} ${status} feedback items.\n\n${JSON.stringify(enriched, null, 2)}` }] };
    }

    return { content: [{ type: "text" as const, text: `No ${status} feedback found.` }] };
  },
});

mcpServer.tool("dismiss_feedback", {
  description: "Dismiss a feedback item.",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("standard_flags").update({ status: "dismissed" }).eq("id", params.id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Feedback ${params.id} dismissed.` }] };
  },
});

mcpServer.tool("delete_feedback", {
  description: "Permanently delete a feedback item.",
  inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (params: { id: string }) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("standard_flags").delete().eq("id", params.id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `Feedback ${params.id} deleted.` }] };
  },
});

// ── Backlog tools ─────────────────────────────────────────────────

mcpServer.tool("list_backlog", {
  description: "List all Backlog standards for review and editing.",
  inputSchema: { type: "object" as const, properties: {} },
  handler: async () => {
    const sb = getSupabase();
    const { data, error } = await sb.from("standards").select("id, title, acronym, description, organization, tags, link, created_at").eq("status", "Backlog").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text" as const, text: `${data?.length || 0} standards in Backlog.\n\n${JSON.stringify(data, null, 2)}` }] };
  },
});

// ── Transport with auth middleware ────────────────────────────────
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcpServer);

app.all("/*", async (c) => {
  // Allow OPTIONS through for CORS
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
        "Access-Control-Expose-Headers": "mcp-session-id",
      },
    });
  }

  // Verify Bearer token
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized", error_description: "Bearer token required" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
        "Access-Control-Expose-Headers": "mcp-session-id",
        "WWW-Authenticate": `Bearer realm="admin.prosecco.dev", resource_metadata="https://admin.prosecco.dev/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return new Response(JSON.stringify({ error: "invalid_token", error_description: "Token is invalid or expired" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
        "Access-Control-Expose-Headers": "mcp-session-id",
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    });
  }

  return await httpHandler(c.req.raw);
});

Deno.serve(app.fetch);
