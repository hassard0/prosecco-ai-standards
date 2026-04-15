import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin/contributor role
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const hasAccess = roles?.some(
      (r: any) => r.role === "admin" || r.role === "contributor"
    );
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { standard_id } = await req.json();
    if (!standard_id) {
      return new Response(
        JSON.stringify({ error: "standard_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the standard
    const { data: standard, error: stdError } = await serviceClient
      .from("standards")
      .select("*")
      .eq("id", standard_id)
      .single();

    if (stdError || !standard) {
      return new Response(
        JSON.stringify({ error: "Standard not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch timeline from standard_summaries
    const { data: summaries } = await serviceClient
      .from("standard_summaries")
      .select("timeline_events")
      .eq("standard_id", standard_id);

    const existingTimeline = summaries?.flatMap(
      (s: any) => s.timeline_events || []
    ) || [];

    // Step 1: Use Perplexity to search for current info about this standard
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "PERPLEXITY_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const searchQuery = `"${standard.title}"${standard.acronym ? ` "${standard.acronym}"` : ""} standard specification ${standard.organization || ""} authors contributors organization timeline latest updates`;

    console.log("Perplexity search:", searchQuery);

    const perplexityRes = await fetch(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content:
                "You are a research assistant. Provide detailed, factual information about the given standard/specification. Include: the official organization behind it, all known authors/editors/contributors with their company affiliations, key timeline events (releases, drafts, major updates with dates), and the current status. Be thorough and cite specifics.",
            },
            {
              role: "user",
              content: `Research this standard/specification thoroughly:\n\nTitle: ${standard.title}\n${standard.acronym ? `Acronym: ${standard.acronym}\n` : ""}${standard.organization ? `Organization: ${standard.organization}\n` : ""}${standard.link ? `URL: ${standard.link}\n` : ""}\n\nProvide:\n1. The correct organization name\n2. All known authors, editors, and contributors with their company/organization affiliations\n3. Timeline of key events (draft dates, release dates, major revisions) with specific dates\n4. Current status and any recent updates`,
            },
          ],
          search_recency_filter: "year",
        }),
      }
    );

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text();
      console.error("Perplexity error:", perplexityRes.status, errText);
      if (perplexityRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Search rate limited, try again later" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: "Search failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const perplexityData = await perplexityRes.json();
    const researchContent =
      perplexityData.choices?.[0]?.message?.content || "";
    const citations = perplexityData.citations || [];

    console.log("Perplexity research length:", researchContent.length);

    // Step 2: Use Gemini to analyze and produce structured corrections
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const currentAuthors = standard.authors || [];
    const currentOrg = standard.organization || "";

    const geminiRes = await fetch(
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
            {
              role: "system",
              content: `You are a meticulous fact-checker for a directory of AI interoperability standards. Compare the current database record against the research findings and propose corrections. Only suggest changes when the research clearly indicates the current data is wrong or incomplete. Be conservative — don't suggest changes based on ambiguous information.`,
            },
            {
              role: "user",
              content: `## Current Database Record

Title: ${standard.title}
Acronym: ${standard.acronym || "(none)"}
Organization: ${currentOrg || "(none)"}
Description: ${standard.description}
Status: ${standard.status}
Primary Link: ${standard.link || "(none)"}

Current Resources:
${JSON.stringify(standard.resources || [], null, 2)}

Current Authors:
${currentAuthors.length > 0 ? JSON.stringify(currentAuthors, null, 2) : "(none)"}

Current Timeline Events:
${existingTimeline.length > 0 ? JSON.stringify(existingTimeline, null, 2) : "(none)"}

## Research Findings

${researchContent}

## Instructions

Compare the research against the current record. Use the extract_qa_results tool to return structured corrections. Only include fields where you have HIGH CONFIDENCE that a correction is needed. For authors, include ALL authors you can identify from the research (both existing correct ones and new ones). For timeline, include ALL events with specific dates.

IMPORTANT for the link field: If the research reveals a more authoritative or canonical URL for this standard's primary specification (e.g. an official spec page, RFC document, or IETF datatracker link that is better than the current primary link), suggest it via the "link" field. The current primary link would then become an additional resource entry.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_qa_results",
                description:
                  "Extract structured QA corrections for a standard",
                parameters: {
                  type: "object",
                  properties: {
                    organization: {
                      type: "object",
                      properties: {
                        current: { type: "string" },
                        suggested: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["current", "suggested", "reason"],
                    },
                    authors: {
                      type: "object",
                      properties: {
                        suggested: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              company: { type: "string" },
                              role: { type: "string" },
                            },
                            required: ["name", "company"],
                          },
                        },
                        reason: { type: "string" },
                      },
                      required: ["suggested", "reason"],
                    },
                    timeline_events: {
                      type: "object",
                      properties: {
                        suggested: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              date: { type: "string", description: "ISO date string YYYY-MM-DD or YYYY-MM" },
                              title: { type: "string" },
                              description: { type: "string" },
                              type: {
                                type: "string",
                                enum: ["release", "draft", "decision", "meeting", "deadline", "milestone", "other"],
                              },
                            },
                            required: ["date", "title", "type"],
                          },
                        },
                        reason: { type: "string" },
                      },
                      required: ["suggested", "reason"],
                    },
                    description: {
                      type: "object",
                      properties: {
                        suggested: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["suggested", "reason"],
                    },
                    link: {
                      type: "object",
                      description: "Suggest a better primary specification URL if found. The current link will be demoted to a resource.",
                      properties: {
                        suggested: { type: "string", description: "The better canonical URL" },
                        suggested_label: { type: "string", description: "Label for the old link when moved to resources, e.g. 'Original Link'" },
                        reason: { type: "string" },
                      },
                      required: ["suggested", "reason"],
                    },
                    summary: {
                      type: "string",
                      description: "Brief overall QA summary of findings",
                    },
                  },
                  required: ["summary"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_qa_results" },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limited, try again later" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (geminiRes.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Add funds in Settings > Workspace > Usage.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiRes.json();
    const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "AI did not return structured results" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let qaResults: any;
    try {
      qaResults =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI results" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...qaResults,
          citations,
          current: {
            organization: currentOrg,
            authors: currentAuthors,
            timeline_events: existingTimeline,
            description: standard.description,
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("QA error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
