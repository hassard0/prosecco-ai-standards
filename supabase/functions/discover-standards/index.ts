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
            content: `You are an expert on technical standards and specifications across technology domains. Your job is to identify notable standards, protocols, specifications, frameworks, working groups, drafts, and governance documents from specific organizations.

Do NOT prioritize or bias toward AI, ML, agents, or LLMs unless the organization itself is specifically centered on those areas. Instead, return the organization's broader and most relevant standards landscape across its actual remit (for example: web, identity, security, networking, cloud, interoperability, data formats, privacy, accessibility, governance, and adjacent technical areas).

For each standard found, provide accurate metadata. If you're unsure about a detail, leave it empty rather than guessing.`,
          },
          {
            role: "user",
            content: `Find a broad, representative set of notable standards, protocols, and specifications from these organizations: ${orgList}

Do not scope results to AI, ML, agents, or LLMs. Include the standards each organization is actually known for across its full technology domain.

For each one, provide the title, acronym (if any), a concise description, the publishing organization, the direct URL link to the specification or project page, and relevant tags.

Be thorough and comprehensive — return at least 15-20 standards per organization if they exist. Include published standards, drafts, working groups, frameworks, guidelines, and other significant specifications. Always include the spec URL when available.`,
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
    const standards = parsed.standards || [];

    // Verify links in parallel with a timeout
    const verified = await Promise.all(
      standards.map(async (s: any) => {
        if (!s.link) return s;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch(s.link, {
            method: "HEAD",
            signal: ctrl.signal,
            redirect: "follow",
          });
          clearTimeout(timer);
          if (res.ok || res.status === 405 || res.status === 403) {
            // 405/403 often means the URL exists but blocks HEAD; keep it
            return s;
          }
          console.log(`Link check failed (${res.status}): ${s.link}`);
          return { ...s, link: null };
        } catch {
          console.log(`Link unreachable: ${s.link}`);
          return { ...s, link: null };
        }
      })
    );

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
