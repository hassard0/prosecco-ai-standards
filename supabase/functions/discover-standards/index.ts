import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type DiscoveredStandard = {
  title: string;
  acronym?: string;
  description: string;
  organization: string;
  link?: string | null;
  tags?: string[];
};

const ORGANIZATION_DOMAINS: Record<string, string[]> = {
  "IETF": ["ietf.org", "datatracker.ietf.org", "rfc-editor.org"],
  "Linux Foundation": ["linuxfoundation.org", "lfprojects.org"],
  "FIDO Alliance": ["fidoalliance.org"],
  "CNCF": ["cncf.io"],
  "OpenID Foundation": ["openid.net"],
  "W3C": ["w3.org"],
  "OASIS": ["oasis-open.org", "docs.oasis-open.org"],
  "NIST": ["nist.gov", "csrc.nist.gov"],
  "IEEE": ["ieee.org", "standards.ieee.org"],
  "ISO/IEC": ["iso.org", "iec.ch"],
};

const SEARCH_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

function normalizeUrl(url: string) {
  return url.replace(/\/$/, "");
}

function getDomainsForOrganization(organization: string) {
  const direct = ORGANIZATION_DOMAINS[organization];
  if (direct) return direct;

  const normalizedEntry = Object.entries(ORGANIZATION_DOMAINS).find(([name]) =>
    name.toLowerCase() === organization.toLowerCase()
  );

  return normalizedEntry?.[1] ?? [];
}

async function verifyUrl(url: string) {
  const methods: Array<"HEAD" | "GET"> = ["HEAD", "GET"];

  for (const method of methods) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": SEARCH_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (res.ok || res.status === 403 || res.status === 405) {
        return true;
      }
    } catch {
      // Try next method
    }
  }

  return false;
}

function extractDuckDuckGoLinks(html: string) {
  const matches = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"#]+)"[^>]*>/gi)];
  const urls = matches
    .map((match) => decodeHtmlEntities(match[1]))
    .filter((url) => !url.includes("duckduckgo.com"));

  return Array.from(new Set(urls.map(normalizeUrl)));
}

async function searchForOfficialSpecLink(standard: DiscoveredStandard) {
  const domains = getDomainsForOrganization(standard.organization);
  const domainHints = domains.length > 0 ? domains.map((domain) => `site:${domain}`).join(" OR ") : "";
  const query = `${standard.title} ${standard.acronym ?? ""} ${standard.organization} specification standard ${domainHints}`.trim();
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": SEARCH_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const candidates = extractDuckDuckGoLinks(html).filter((url) => {
      if (domains.length === 0) return true;
      return domains.some((domain) => new RegExp(`(^https?:\\/\\/)?([^/]+\\.)?${escapeRegExp(domain)}(/|$)`, "i").test(url));
    });

    for (const candidate of candidates.slice(0, 5)) {
      if (await verifyUrl(candidate)) {
        return candidate;
      }
    }
  } catch (error) {
    console.log(`Search fallback failed for ${standard.title}:`, error instanceof Error ? error.message : error);
  }

  return null;
}

async function ensureWorkingLink(standard: DiscoveredStandard) {
  if (standard.link && await verifyUrl(standard.link)) {
    return standard;
  }

  const fallbackLink = await searchForOfficialSpecLink(standard);
  if (fallbackLink) {
    return { ...standard, link: fallbackLink };
  }

  console.log(`No verified spec link found: ${standard.title} (${standard.organization})`);
  return { ...standard, link: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizations } = await req.json();

    if (!organizations || !Array.isArray(organizations) || organizations.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "At least one organization is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgList = organizations.join(", ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert on AI, ML, agent, and agentic technology standards. Your job is to identify standards, protocols, specifications, and frameworks from specific organizations that are specifically about AI, machine learning, agents, agentic systems, LLMs, or closely related topics (e.g. AI safety, AI ethics, AI governance, AI interoperability).

Only include standards that are directly related to AI, ML, agents, or agentic systems. Do NOT include general-purpose standards (like generic HTTP specs, general security frameworks, web standards, identity protocols, etc.) unless they have a specific AI/ML/agent focus.

Prioritize official specification pages on the publishing organization's own domain when returning links. Avoid guessed, placeholder, or committee-root URLs unless they are the canonical page for that exact standard.

For each standard found, provide accurate metadata. If you're unsure about a detail, leave it empty rather than guessing.`,
          },
          {
            role: "user",
            content: `Find ALL AI, ML, agent, and agentic-related standards, protocols, and specifications from these organizations: ${orgList}

Only return standards specifically about AI, machine learning, agents, agentic systems, or LLMs. Do not return general technology standards.

For each one, provide the title, acronym (if any), a concise description, the publishing organization, the direct URL link to the official specification or project page, and relevant tags.

Be thorough — return as many AI/ML/agent standards as exist for each organization. Include working groups, drafts, published specs, frameworks, and guidelines. Always include the most official spec URL when available.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_standards",
              description: "Return a list of discovered AI/Agent/LLM standards",
              parameters: {
                type: "object",
                properties: {
                  standards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Full name of the standard" },
                        acronym: { type: "string", description: "Short acronym if applicable" },
                        description: { type: "string", description: "1-2 sentence description" },
                        organization: { type: "string", description: "Publishing organization" },
                        link: { type: "string", description: "URL to the specification or project page" },
                        tags: {
                          type: "array",
                          items: { type: "string" },
                          description: "Relevant tags like Protocol, Agents, Safety, etc.",
                        },
                      },
                      required: ["title", "description", "organization"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["standards"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_standards" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limited — please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ success: false, error: "No results returned from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const standards = (parsed.standards || []) as DiscoveredStandard[];

    const verified = await Promise.all(standards.map((standard) => ensureWorkingLink(standard)));

    return new Response(
      JSON.stringify({ success: true, standards: verified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("discover-standards error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});