import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
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

    // Fetch the page content
    let pageContent: string;
    try {
      const pageResp = await fetch(url, {
        headers: { "User-Agent": "Prosecco.dev AI Standards Bot/1.0" },
      });
      if (!pageResp.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch URL: ${pageResp.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      pageContent = await pageResp.text();
      // Truncate to avoid token limits
      if (pageContent.length > 30000) {
        pageContent = pageContent.substring(0, 30000);
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
- resources: Array of related resources found on the page, each with { type, label, url } where type is one of: "mailing_list", "github", "working_group", "reference_impl", "documentation", "blog", "video", "discord", "slack", "other"
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
                          type: { type: "string", enum: ["mailing_list", "github", "working_group", "reference_impl", "documentation", "blog", "video", "discord", "slack", "other"] },
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
    const githubRepos: string[] = [];
    const ghRepoPattern = /https?:\/\/github\.com\/([^\/\s]+\/[^\/\s#?]+)/g;

    // Check extracted resources for GitHub repos
    if (extracted.resources) {
      for (const r of extracted.resources) {
        if (r.type === "github" && r.url) {
          const match = r.url.match(/github\.com\/([^\/\s]+\/[^\/\s#?]+)/);
          if (match) githubRepos.push(match[1]);
        }
      }
    }

    // Also scan the page content for GitHub URLs
    let ghMatch;
    while ((ghMatch = ghRepoPattern.exec(pageContent)) !== null) {
      const repo = ghMatch[1].replace(/\.git$/, "");
      if (!githubRepos.includes(repo)) githubRepos.push(repo);
    }

    // Also check the input URL itself
    const inputMatch = url.match(/github\.com\/([^\/\s]+\/[^\/\s#?]+)/);
    if (inputMatch) {
      const repo = inputMatch[1].replace(/\.git$/, "");
      if (!githubRepos.includes(repo)) githubRepos.push(repo);
    }

    // Fetch contributors from GitHub repos (up to 3 repos, top 30 contributors each)
    const existingNames = new Set((extracted.authors || []).map((a: any) => a.name?.toLowerCase()));
    const ghContributors: any[] = [];

    for (const repo of githubRepos.slice(0, 3)) {
      try {
        const contribResp = await fetch(
          `https://api.github.com/repos/${repo}/contributors?per_page=30`,
          { headers: { "User-Agent": "Prosecco.dev AI Standards Bot/1.0", Accept: "application/vnd.github.v3+json" } }
        );
        if (!contribResp.ok) continue;
        const contributors = await contribResp.json();
        if (!Array.isArray(contributors)) continue;

        for (const c of contributors) {
          if (!c.login || c.type === "Bot") continue;
          // Try to get the user's real name and company
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
            }
          } catch {
            // Skip individual user fetch failures
          }
        }
      } catch {
        // Skip repo fetch failures
      }
    }

    // Merge GitHub contributors into authors
    if (ghContributors.length > 0) {
      extracted.authors = [...(extracted.authors || []), ...ghContributors];
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
