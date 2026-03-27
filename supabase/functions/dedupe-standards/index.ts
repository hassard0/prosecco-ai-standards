import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a spec de-duplication analyst. You receive an inventory of specifications and must detect duplicate, alias, and collision clusters.

## Rules
- Do NOT treat de-duplication as simple URL or title matching.
- Model entries as a graph with relationships: alias_of, editor_copy_of, replaced_by, merged_into, companion_to, shares_acronym_with.
- Separate: true duplicates, aliases that should roll up, and distinct specs with confusingly similar names.
- Acronym similarity alone is NEVER sufficient to mark as duplicate.

## Canonicalization
- IETF: prefer datatracker.ietf.org/doc/draft-.../ or /doc/rfcNNNN/
- Treat archive, html-rendered, and revision-pinned URLs as aliases
- GitHub editor copies are aliases of the canonical spec
- Non-IETF: prefer official standards/spec site over mirrors/repos

## Confidence
- high: explicit metadata or direct textual signal
- medium: strong structural inference  
- low: likely but not directly confirmed

## Output
Return ONLY a JSON tool call with clusters of related entries. Each cluster has a canonical entry and related entries with their relationship type.`;

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

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
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

    const { standards } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build a compact inventory for the AI
    const inventory = standards.map((s: any) => ({
      id: s.id,
      title: s.title,
      acronym: s.acronym || null,
      description: (s.description || "").slice(0, 300),
      link: s.link || null,
      organization: s.organization || null,
      tags: s.tags || [],
      status: s.status,
    }));

    const userPrompt = `Analyze this spec inventory for duplicates, aliases, and collisions. There are ${inventory.length} entries.\n\n${JSON.stringify(inventory, null, 1)}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_clusters",
                description:
                  "Report duplicate/alias/collision clusters found in the spec inventory.",
                parameters: {
                  type: "object",
                  properties: {
                    clusters: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          canonical_id: {
                            type: "string",
                            description:
                              "The id of the entry that should be the canonical/kept entry",
                          },
                          canonical_title: { type: "string" },
                          related: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: {
                                  type: "string",
                                  description: "The id of the related entry",
                                },
                                title: { type: "string" },
                                relationship: {
                                  type: "string",
                                  enum: [
                                    "true_duplicate",
                                    "alias",
                                    "editor_copy",
                                    "replaced_by",
                                    "merged_into",
                                    "acronym_collision",
                                  ],
                                },
                                confidence: {
                                  type: "string",
                                  enum: ["high", "medium", "low"],
                                },
                                reason: {
                                  type: "string",
                                  description:
                                    "Brief explanation of why this relationship was detected",
                                },
                              },
                              required: [
                                "id",
                                "title",
                                "relationship",
                                "confidence",
                                "reason",
                              ],
                            },
                          },
                          notes: {
                            type: "string",
                            description:
                              "Any additional context about this cluster",
                          },
                        },
                        required: [
                          "canonical_id",
                          "canonical_title",
                          "related",
                        ],
                      },
                    },
                    summary: {
                      type: "string",
                      description:
                        "Brief overview of what was found (e.g. '3 duplicate clusters, 2 collisions')",
                    },
                  },
                  required: ["clusters", "summary"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "report_clusters" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited — please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dedupe-standards error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
