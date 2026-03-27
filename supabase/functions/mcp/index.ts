import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Input Sanitization ────────────────────────────────────────
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

function sanitizeText(input: string, maxLength: number): string {
  const stripped = stripHtml(input);
  return stripped.slice(0, maxLength);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ── Rate Limiting for Write Tools ─────────────────────────────
const writeRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WRITE_RATE_WINDOW = 60_000; // 1 minute
const WRITE_RATE_LIMIT = 5; // max 5 write operations per IP per minute

function checkWriteRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = writeRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    writeRateLimitMap.set(ip, { count: 1, resetAt: now + WRITE_RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= WRITE_RATE_LIMIT;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of writeRateLimitMap) {
    if (now > entry.resetAt) writeRateLimitMap.delete(key);
  }
}, 5 * 60_000);

// Track client IP from latest request for use in tool handlers
let _currentRequestIp = "unknown";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

function getServiceSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const app = new Hono();

const mcpServer = new McpServer({
  name: "prosecco-standards-directory",
  version: "1.0.0",
});

// Tool: List all standards
mcpServer.tool("list_standards", {
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
      content: [{ type: "text" as const, text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    };
  },
});

// Tool: Get a single standard by ID
mcpServer.tool("get_standard", {
  description:
    "Get full details of a specific AI standard by its ID, including authors, resources, and the latest discussion summary.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "The UUID of the standard" },
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

    const { data: summaries } = await supabase
      .from("standard_summaries")
      .select("summary, whats_new, generated_at")
      .eq("standard_id", params.id)
      .order("generated_at", { ascending: false })
      .limit(1);

    const result: Record<string, unknown> = {
      ...standard,
      prosecco_url: `https://prosecco.dev/standard/${standard.id}`,
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
mcpServer.tool("search_standards", {
  description:
    "Search AI standards by keyword across titles, descriptions, acronyms, and organizations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search keyword or phrase" },
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
mcpServer.tool("get_directory_overview", {
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
      url: "https://prosecco.dev",
      total_standards: standards?.length ?? 0,
      by_status: statusCounts,
      organizations: [...orgs].sort(),
      tags: [...tags].sort(),
      endpoints: {
        mcp: "https://prosecco.dev/mcp",
        llms_txt: "https://prosecco.dev/llms.txt",
        llms_full_txt: "https://prosecco.dev/llms-full.txt",
        directory_json: "https://prosecco.dev/directory.json",
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(overview, null, 2) }],
    };
  },
});

// Tool: List available tags
mcpServer.tool("list_tags", {
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
mcpServer.tool("search_authors", {
  description:
    "Search for authors and contributors across all standards. Returns matching people with their roles, companies, and which standards they contribute to.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Name (or partial name) of the author to search for" },
      company: { type: "string", description: "Filter by company/organization affiliation" },
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
mcpServer.tool("list_organizations", {
  description:
    "List all organizations that publish or maintain standards in the directory, with counts and their standards.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Filter by organization name (partial match)" },
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
mcpServer.tool("list_contributors_by_company", {
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

// Tool: Suggest a new standard for the directory
mcpServer.tool("suggest_standard", {
  description:
    "Submit a community suggestion for a new AI standard to be added to the Prosecco.dev directory. The standard will be added to the Backlog with a 'community-submission' tag for admin review.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "The name/title of the standard or protocol" },
      url: { type: "string", description: "URL to the standard's specification or homepage" },
      description: {
        type: "string",
        description: "Brief description of what the standard does (optional, will use a placeholder if not provided)",
      },
      organization: {
        type: "string",
        description: "The organization or group behind the standard (optional)",
      },
    },
    required: ["name", "url"],
  },
  handler: async (params: { name: string; url: string; description?: string; organization?: string }) => {
    // Rate limit write operations
    if (!checkWriteRateLimit(_currentRequestIp)) {
      return {
        content: [{ type: "text" as const, text: "Rate limit exceeded. Please wait a moment before submitting again." }],
        isError: true,
      };
    }

    // Validate and sanitize inputs
    const name = sanitizeText(params.name, 200);
    const url = params.url?.trim() || "";
    const description = params.description ? sanitizeText(params.description, 2000) : undefined;
    const organization = params.organization ? sanitizeText(params.organization, 200) : undefined;

    if (!name || name.length < 2) {
      return { content: [{ type: "text" as const, text: "Name must be at least 2 characters after sanitization." }], isError: true };
    }
    if (!isValidUrl(url)) {
      return { content: [{ type: "text" as const, text: "A valid HTTP(S) URL is required." }], isError: true };
    }

    const supabase = getServiceSupabase();

    // Check community submission cap
    const { count, error: countError } = await supabase
      .from("standards")
      .select("id", { count: "exact", head: true })
      .eq("status", "Backlog")
      .contains("tags", ["community-submission"]);

    if (countError) throw new Error(`Database error: ${countError.message}`);

    if ((count ?? 0) >= 200) {
      return {
        content: [{
          type: "text" as const,
          text: "Thank you for your interest in contributing! We currently have a large number of community submissions in our review queue and need to process them before accepting new ones. Please try again later — we appreciate your patience!",
        }],
      };
    }

    // Check if a standard with the same title already exists
    const { data: existing } = await supabase
      .from("standards")
      .select("id, title, status")
      .ilike("title", params.name)
      .limit(1);

    if (existing && existing.length > 0) {
      return {
        content: [{
          type: "text" as const,
          text: `A standard with a similar name already exists: "${existing[0].title}" (status: ${existing[0].status}, id: ${existing[0].id}). If you believe this is different, please contact the maintainers.`,
        }],
      };
    }

    const { data, error } = await supabase
      .from("standards")
      .insert({
        title: params.name,
        link: params.url,
        description: params.description || `Community-submitted standard. See: ${params.url}`,
        organization: params.organization || null,
        status: "Backlog",
        tags: ["community-submission"],
      })
      .select("id, title")
      .single();

    if (error) throw new Error(`Failed to submit standard: ${error.message}`);

    return {
      content: [{
        type: "text" as const,
        text: `Successfully submitted "${data.title}" (id: ${data.id}) for review. It has been added to the Backlog with a "community-submission" tag. The Prosecco.dev team will review and curate it.`,
      }],
    };
  },
});

// Tool: Report an issue with a standard
mcpServer.tool("report_issue", {
  description:
    "Report an issue with an existing standard in the Prosecco.dev directory — such as outdated information, incorrect details, or a duplicate entry. This feeds into the admin review queue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      standard_id: {
        type: "string",
        description: "UUID of the standard to report an issue for. Provide this OR standard_name.",
      },
      standard_name: {
        type: "string",
        description: "Name of the standard to report an issue for. Provide this OR standard_id.",
      },
      issue: {
        type: "string",
        description: "Description of the issue (e.g. 'Status should be Approved', 'Description is outdated')",
      },
      is_duplicate: {
        type: "boolean",
        description: "Set to true if reporting this standard as a duplicate of another",
      },
      duplicate_of_id: {
        type: "string",
        description: "UUID of the standard this is a duplicate of (required when is_duplicate is true)",
      },
    },
    required: ["issue"],
  },
  handler: async (params: {
    standard_id?: string;
    standard_name?: string;
    issue: string;
    is_duplicate?: boolean;
    duplicate_of_id?: string;
  }) => {
    const supabase = getSupabase();

    // Check feedback queue cap
    const { count: feedbackCount, error: countError } = await supabase
      .from("standard_flags")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (countError) throw new Error(`Database error: ${countError.message}`);

    if ((feedbackCount ?? 0) >= 500) {
      return {
        content: [{
          type: "text" as const,
          text: "Thank you for wanting to help improve the directory! Our feedback queue is currently full and we need to work through existing reports before accepting new ones. Please try again soon — we really appreciate your patience!",
        }],
      };
    }
    if (!params.standard_id && !params.standard_name) {
      return {
        content: [{ type: "text" as const, text: "Please provide either standard_id or standard_name to identify the standard." }],
        isError: true,
      };
    }

    // Resolve the standard
    let standardId = params.standard_id;
    let standardTitle = "";

    if (standardId) {
      const { data, error } = await supabase
        .from("standards")
        .select("id, title")
        .eq("id", standardId)
        .single();
      if (error || !data) {
        return {
          content: [{ type: "text" as const, text: `Standard not found with id: ${standardId}` }],
          isError: true,
        };
      }
      standardTitle = data.title;
    } else {
      const { data, error } = await supabase
        .from("standards")
        .select("id, title")
        .ilike("title", `%${params.standard_name}%`)
        .limit(1);
      if (error || !data || data.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No standard found matching name: "${params.standard_name}"` }],
          isError: true,
        };
      }
      standardId = data[0].id;
      standardTitle = data[0].title;
    }

    // Build feedback text
    let feedback = params.issue;
    if (params.is_duplicate && params.duplicate_of_id) {
      // Verify the duplicate target exists
      const { data: dupTarget } = await supabase
        .from("standards")
        .select("id, title")
        .eq("id", params.duplicate_of_id)
        .single();

      if (dupTarget) {
        feedback = `[DUPLICATE REPORT] This standard appears to be a duplicate of "${dupTarget.title}" (${dupTarget.id}).\n\n${params.issue}`;
      } else {
        feedback = `[DUPLICATE REPORT] Reported as duplicate of id: ${params.duplicate_of_id} (not found in directory).\n\n${params.issue}`;
      }
    } else if (params.is_duplicate) {
      return {
        content: [{ type: "text" as const, text: "When reporting a duplicate, please provide the duplicate_of_id — the UUID of the standard this is a duplicate of." }],
        isError: true,
      };
    }

    const { error: insertError } = await supabase
      .from("standard_flags")
      .insert({
        standard_id: standardId,
        feedback,
        user_email: null,
      });

    if (insertError) throw new Error(`Failed to submit issue: ${insertError.message}`);

    return {
      content: [{
        type: "text" as const,
        text: `Issue reported for "${standardTitle}" (${standardId}). The Prosecco.dev team will review it. Thank you for helping improve the directory.`,
      }],
    };
  },
});

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcpServer);

app.all("/*", async (c) => {
  return await httpHandler(c.req.raw);
});

Deno.serve(app.fetch);
