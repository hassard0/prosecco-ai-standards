import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

const app = new Hono();

const mcpServer = new McpServer({
  name: "prosecco-standards-directory",
  version: "1.0.0",
});

// Tool: List all standards (with optional status/tag filters)
mcpServer.tool({
  name: "list_standards",
  description:
    "List AI interoperability standards tracked by Prosecco.dev. Optionally filter by status (Backlog, Emerging, Draft, Approved) or tag.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        description: "Filter by maturity status: Backlog, Emerging, Draft, or Approved",
        enum: ["Backlog", "Emerging", "Draft", "Approved"],
      },
      tag: {
        type: "string",
        description: "Filter by topic tag (e.g. 'agent-communication', 'identity', 'tool-use')",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default 50, max 200)",
      },
    },
  },
  handler: async (params: { status?: string; tag?: string; limit?: number }) => {
    const supabase = getSupabase();
    let query = supabase
      .from("standards")
      .select("id, title, acronym, description, organization, status, tags, link, updated_at")
      .order("title");

    if (params.status) query = query.eq("status", params.status);
    if (params.tag) query = query.contains("tags", [params.tag]);

    const limit = Math.min(params.limit || 50, 200);
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);

    const summary = `Found ${data?.length ?? 0} standards${params.status ? ` with status "${params.status}"` : ""}${params.tag ? ` tagged "${params.tag}"` : ""}.`;

    return {
      content: [
        {
          type: "text" as const,
          text: `${summary}\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  },
});

// Tool: Get a single standard by ID with full details
mcpServer.tool({
  name: "get_standard",
  description:
    "Get full details of a specific AI standard by its ID, including authors, resources, and the latest discussion summary.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "The UUID of the standard",
      },
    },
    required: ["id"],
  },
  handler: async (params: { id: string }) => {
    const supabase = getSupabase();

    const { data: standard, error } = await supabase
      .from("standards")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !standard) {
      return {
        content: [{ type: "text" as const, text: `Standard not found: ${params.id}` }],
        isError: true,
      };
    }

    // Fetch latest summary
    const { data: summaries } = await supabase
      .from("standard_summaries")
      .select("summary, whats_new, generated_at")
      .eq("standard_id", params.id)
      .order("generated_at", { ascending: false })
      .limit(1);

    const result: Record<string, unknown> = {
      ...standard,
      prosecco_url: `https://prosecco-ai-standards.lovable.app/standard/${standard.id}`,
    };

    if (summaries && summaries.length > 0) {
      result.latest_summary = summaries[0].summary;
      result.whats_new = summaries[0].whats_new;
      result.summary_generated_at = summaries[0].generated_at;
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
});

// Tool: Search standards by keyword
mcpServer.tool({
  name: "search_standards",
  description:
    "Search AI standards by keyword across titles, descriptions, acronyms, and organizations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search keyword or phrase",
      },
    },
    required: ["query"],
  },
  handler: async (params: { query: string }) => {
    const supabase = getSupabase();
    const q = params.query.toLowerCase();

    const { data, error } = await supabase
      .from("standards")
      .select("id, title, acronym, description, organization, status, tags, link, updated_at")
      .order("title");

    if (error) throw new Error(`Database error: ${error.message}`);

    const matches = (data || []).filter((s) => {
      const haystack = [s.title, s.acronym, s.description, s.organization]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${matches.length} standards matching "${params.query}".\n\n${JSON.stringify(matches, null, 2)}`,
        },
      ],
    };
  },
});

// Tool: Get directory overview / stats
mcpServer.tool({
  name: "get_directory_overview",
  description:
    "Get an overview of the Prosecco.dev AI standards directory including counts by status, list of organizations, and available tags.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  handler: async () => {
    const supabase = getSupabase();

    const { data: standards, error } = await supabase
      .from("standards")
      .select("status, organization, tags")
      .order("title");

    if (error) throw new Error(`Database error: ${error.message}`);

    const statusCounts: Record<string, number> = {};
    const orgs = new Set<string>();
    const tags = new Set<string>();

    for (const s of standards || []) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
      if (s.organization) orgs.add(s.organization);
      if (s.tags) for (const t of s.tags) tags.add(t);
    }

    const overview = {
      name: "Prosecco.dev — AI Standards Directory",
      description:
        "A curated, open directory of AI agent interoperability standards, protocols, and specifications.",
      url: "https://prosecco-ai-standards.lovable.app",
      total_standards: standards?.length ?? 0,
      by_status: statusCounts,
      organizations: [...orgs].sort(),
      tags: [...tags].sort(),
      endpoints: {
        mcp: "https://prosecco-ai-standards.lovable.app/mcp",
        llms_txt: "https://prosecco-ai-standards.lovable.app/llms.txt",
        llms_full_txt: "https://prosecco-ai-standards.lovable.app/llms-full.txt",
        directory_json: "https://prosecco-ai-standards.lovable.app/directory.json",
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(overview, null, 2) }],
    };
  },
});

// Tool: List available tags
mcpServer.tool({
  name: "list_tags",
  description: "List all topic tags used across standards in the directory, with counts.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  handler: async () => {
    const supabase = getSupabase();

    const { data, error } = await supabase.from("standards").select("tags");
    if (error) throw new Error(`Database error: ${error.message}`);

    const tagCounts: Record<string, number> = {};
    for (const s of data || []) {
      if (s.tags) for (const t of s.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }

    const sorted = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    return {
      content: [{ type: "text" as const, text: JSON.stringify(sorted, null, 2) }],
    };
  },
});

// Tool: Search authors/contributors
mcpServer.tool({
  name: "search_authors",
  description:
    "Search for authors and contributors across all standards. Returns matching people with their roles, companies, and which standards they contribute to.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Name (or partial name) of the author to search for",
      },
      company: {
        type: "string",
        description: "Filter by company/organization affiliation",
      },
    },
  },
  handler: async (params: { name?: string; company?: string }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("standards")
      .select("id, title, acronym, authors")
      .order("title");
    if (error) throw new Error(`Database error: ${error.message}`);

    const results: { name: string; company: string; role: string; url: string; standards: { id: string; title: string }[] }[] = [];
    const seen = new Map<string, number>();

    for (const s of data || []) {
      const authors = Array.isArray(s.authors) ? s.authors as { name: string; company?: string; role?: string; url?: string }[] : [];
      for (const a of authors) {
        if (params.name && !a.name.toLowerCase().includes(params.name.toLowerCase())) continue;
        if (params.company && !(a.company || "").toLowerCase().includes(params.company.toLowerCase())) continue;

        const key = `${a.name}||${a.company || ""}`;
        if (seen.has(key)) {
          results[seen.get(key)!].standards.push({ id: s.id, title: s.title });
        } else {
          seen.set(key, results.length);
          results.push({
            name: a.name,
            company: a.company || "Unknown",
            role: a.role || "",
            url: a.url || "",
            standards: [{ id: s.id, title: s.title }],
          });
        }
      }
    }

    results.sort((a, b) => b.standards.length - a.standards.length);

    return {
      content: [{
        type: "text" as const,
        text: `Found ${results.length} authors${params.name ? ` matching "${params.name}"` : ""}${params.company ? ` at "${params.company}"` : ""}.\n\n${JSON.stringify(results, null, 2)}`,
      }],
    };
  },
});

// Tool: List organizations
mcpServer.tool({
  name: "list_organizations",
  description:
    "List all organizations that publish or maintain standards in the directory, with counts and their standards.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Filter by organization name (partial match)",
      },
    },
  },
  handler: async (params: { name?: string }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("standards")
      .select("id, title, acronym, organization, status")
      .order("title");
    if (error) throw new Error(`Database error: ${error.message}`);

    const orgs = new Map<string, { standards: { id: string; title: string; status: string }[] }>();

    for (const s of data || []) {
      const org = s.organization || "Unknown";
      if (params.name && !org.toLowerCase().includes(params.name.toLowerCase())) continue;
      if (!orgs.has(org)) orgs.set(org, { standards: [] });
      orgs.get(org)!.standards.push({ id: s.id, title: s.title, status: s.status });
    }

    const sorted = [...orgs.entries()]
      .sort((a, b) => b[1].standards.length - a[1].standards.length)
      .map(([name, data]) => ({ organization: name, count: data.standards.length, standards: data.standards }));

    return {
      content: [{
        type: "text" as const,
        text: `Found ${sorted.length} organizations${params.name ? ` matching "${params.name}"` : ""}.\n\n${JSON.stringify(sorted, null, 2)}`,
      }],
    };
  },
});

// Tool: List contributors by company
mcpServer.tool({
  name: "list_contributors_by_company",
  description:
    "List all companies/organizations that have contributors across standards, showing how many people and which standards each company is involved in.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  handler: async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("standards")
      .select("id, title, authors")
      .order("title");
    if (error) throw new Error(`Database error: ${error.message}`);

    const companies = new Map<string, { people: Set<string>; standards: Set<string> }>();

    for (const s of data || []) {
      const authors = Array.isArray(s.authors) ? s.authors as { name: string; company?: string }[] : [];
      for (const a of authors) {
        const co = a.company || "Unknown";
        if (!companies.has(co)) companies.set(co, { people: new Set(), standards: new Set() });
        companies.get(co)!.people.add(a.name);
        companies.get(co)!.standards.add(s.title);
      }
    }

    const sorted = [...companies.entries()]
      .sort((a, b) => b[1].standards.size - a[1].standards.size)
      .map(([company, d]) => ({
        company,
        contributor_count: d.people.size,
        standard_count: d.standards.size,
        contributors: [...d.people].sort(),
        standards: [...d.standards].sort(),
      }));

    return {
      content: [{
        type: "text" as const,
        text: `Found ${sorted.length} companies with contributors.\n\n${JSON.stringify(sorted, null, 2)}`,
      }],
    };
  },
});

const transport = new StreamableHttpTransport();

app.all("/*", async (c) => {
  return await transport.handleRequest(c.req.raw, mcpServer);
});

Deno.serve(app.fetch);
