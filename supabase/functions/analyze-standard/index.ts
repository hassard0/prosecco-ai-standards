import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prosecco.dev",
  "https://www.prosecco.dev",
  "https://prosecco-ai-standards.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

// Block SSRF: private IPs, cloud metadata, loopback
function isBlockedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    // Block cloud metadata
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") return true;
    // Block loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true;
    // Block private ranges
    if (/^10\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
    // Block internal Supabase
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return true;
    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    return false;
  } catch {
    return true;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require admin/contributor authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
    const hasAccess = (roles || []).some((r) => r.role === "admin" || r.role === "contributor");
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: "Admin or contributor access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: SSRF protection
    if (isBlockedUrl(url)) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is not allowed" }),
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

    // Fetch the page content with fallback handling for docs hosts that move between domains
    let pageContent: string | null = null;
    try {
      const candidateUrls = [url];

      if (url.includes("docs.wild-card.ai/")) {
        candidateUrls.push(url.replace("https://docs.wild-card.ai", "https://wildcard.mintlify.app"));
      }

      for (const candidateUrl of [...new Set(candidateUrls)]) {
        const pageResp = await fetch(candidateUrl, {
          headers: {
            "User-Agent": "Prosecco.dev AI Standards Bot/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          },
        });

        if (!pageResp.ok) {
          await pageResp.text();
          continue;
        }

        pageContent = await pageResp.text();
        if (pageContent.length > 30000) {
          pageContent = pageContent.substring(0, 30000);
        }
        break;
      }

      if (!pageContent) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch URL: 404" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({ success: false, error: `Could not reach URL: ${fetchErr}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to extract standard metadata
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are an AI standards analyst. Given the content of a webpage about an AI standard, protocol, or specification, extract structured metadata including any related resources you can find (GitHub repos, mailing lists, working groups, documentation pages, etc).

Also identify the specification's authors, editors, and key contributors. For each person, determine their company/organizational affiliation.

Return a JSON object with these fields:
- title: The full name of the standard/protocol
- acronym: Short acronym if any (e.g., "MCP", "A2A"), or empty string
- description: A clear 2-3 sentence description of what it does
- organization: The company or organization behind it. Use just the company name (e.g. "Google", "Anthropic", "IETF", "Linux Foundation") — not a description or full legal name.
- status: One of "Emerging", "Draft", or "Approved" based on maturity
- tags: Array of relevant tags
- link: The canonical URL for the specification
- resources: Array of related resources found on the page, each with { type, label, url } where type is one of: "primary_spec", "mailing_list", "github", "working_group", "reference_impl", "documentation", "blog", "video", "discord", "slack", "other". Use "primary_spec" for the main specification document URL.
- authors: Array of specification authors/editors/contributors, each with { name, company, role, url } where role is e.g. "Editor", "Chair", "Contributor", "Author". company should be just the company name. url is optional profile link.

Only return valid JSON, no markdown fences or extra text.`,
            },
            {
              role: "user",
              content: `Analyze this webpage and extract AI standard metadata:\n\nURL: ${url}\n\nContent:\n${pageContent}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_standard",
                description: "Extract AI standard metadata from a webpage",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    acronym: { type: "string" },
                    description: { type: "string" },
                    organization: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["Emerging", "Draft", "Approved"],
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                    },
                    link: { type: "string" },
                    resources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["primary_spec", "mailing_list", "github", "working_group", "reference_impl", "documentation", "blog", "video", "discord", "slack", "other"] },
                          label: { type: "string" },
                          url: { type: "string" },
                        },
                        required: ["type", "label", "url"],
                      },
                    },
                    authors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          company: { type: "string" },
                          role: { type: "string" },
                          url: { type: "string" },
                        },
                        required: ["name", "company"],
                      },
                    },
                  },
                  required: [
                    "title",
                    "acronym",
                    "description",
                    "organization",
                    "status",
                    "tags",
                    "link",
                    "resources",
                    "authors",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_standard" },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "AI rate limit reached. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ success: false, error: "AI could not extract standard metadata from this page" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    // Find GitHub repo URLs from resources or the page content and fetch contributors
    // Wrapped in try-catch so GitHub failures never break the overall response
    try {
      const githubRepos: string[] = [];
      const ghRepoPattern = /https?:\/\/github\.com\/([^\/\s]+\/[^\/\s#?]+)/g;

      if (extracted.resources) {
        for (const r of extracted.resources) {
          if (r.type === "github" && r.url) {
            const match = r.url.match(/github\.com\/([^\/\s]+\/[^\/\s#?]+)/);
            if (match) githubRepos.push(match[1]);
          }
        }
      }

      let ghMatch;
      while ((ghMatch = ghRepoPattern.exec(pageContent)) !== null) {
        const repo = ghMatch[1].replace(/\.git$/, "");
        if (!githubRepos.includes(repo)) githubRepos.push(repo);
      }

      const inputMatch = url.match(/github\.com\/([^\/\s]+\/[^\/\s#?]+)/);
      if (inputMatch) {
        const repo = inputMatch[1].replace(/\.git$/, "");
        if (!githubRepos.includes(repo)) githubRepos.push(repo);
      }

      console.log("GitHub repos found:", githubRepos);

      const existingNames = new Set((extracted.authors || []).map((a: any) => a.name?.toLowerCase()));
      const ghContributors: any[] = [];

      for (const repo of githubRepos) {
        try {
          const contribResp = await fetch(
            `https://api.github.com/repos/${repo}/contributors?per_page=100`,
            { headers: { "User-Agent": "Prosecco.dev AI Standards Bot/1.0", Accept: "application/vnd.github.v3+json" } }
          );
          if (!contribResp.ok) { await contribResp.text(); continue; }
          const contributors = await contribResp.json();
          if (!Array.isArray(contributors)) continue;

          for (const c of contributors) {
            if (!c.login || c.type === "Bot") continue;
            try {
              const userResp = await fetch(`https://api.github.com/users/${c.login}`, {
                headers: { "User-Agent": "Prosecco.dev AI Standards Bot/1.0", Accept: "application/vnd.github.v3+json" },
              });
              if (userResp.ok) {
                const user = await userResp.json();
                const name = user.name || c.login;
                if (existingNames.has(name.toLowerCase())) continue;
                existingNames.add(name.toLowerCase());
                ghContributors.push({
                  name,
                  company: (user.company || "").replace(/^@/, "").trim() || "Unknown",
                  role: "GitHub Contributor",
                  url: user.html_url || `https://github.com/${c.login}`,
                });
              } else {
                await userResp.text();
              }
            } catch (ue) {
              console.error("User fetch error:", ue);
            }
          }
        } catch (re) {
          console.error("Repo fetch error:", re);
        }
      }

      if (ghContributors.length > 0) {
        extracted.authors = [...(extracted.authors || []), ...ghContributors];
      }
      console.log("Final authors count:", extracted.authors?.length ?? 0);
    } catch (ghErr) {
      console.error("GitHub enrichment failed entirely, skipping:", ghErr);
      // Don't fail the whole request - just return without GH contributors
    }

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analyze-standard error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
