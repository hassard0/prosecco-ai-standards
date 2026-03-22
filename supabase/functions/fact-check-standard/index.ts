import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { standard_id, feedback } = await req.json();
    if (!standard_id || !feedback) {
      return new Response(
        JSON.stringify({ success: false, error: "standard_id and feedback are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the standard
    const { data: standard, error: fetchErr } = await supabase
      .from("standards")
      .select("*")
      .eq("id", standard_id)
      .single();

    if (fetchErr || !standard) {
      return new Response(
        JSON.stringify({ success: false, error: "Standard not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the spec page if link exists for additional context
    let pageContext = "";
    if (standard.link) {
      try {
        const pageRes = await fetch(standard.link, {
          headers: { "User-Agent": "Prosecco.dev Standards Bot/1.0" },
        });
        if (pageRes.ok) {
          pageContext = (await pageRes.text()).slice(0, 20000);
        }
      } catch {
        // ignore fetch errors
      }
    }

    // Ask AI to fact-check the feedback
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an AI standards fact-checker. You will be given:
1. Current information about a standard
2. Community feedback suggesting changes
3. Optionally, the current content of the standard's specification page

Your job is to:
- Assess whether the feedback is valid
- Provide a confidence level (high, medium, low)
- Suggest specific field updates if the feedback is valid
- Explain your reasoning

Be precise about what should change. For organization, use just the company name (e.g. "Google" not "Google LLC").`,
          },
          {
            role: "user",
            content: `## Current Standard Info
Title: ${standard.title}
Acronym: ${standard.acronym || "N/A"}
Description: ${standard.description}
Organization: ${standard.organization || "N/A"}
Status: ${standard.status}
Tags: ${(standard.tags || []).join(", ")}
Link: ${standard.link || "N/A"}

## Community Feedback
${feedback}

${pageContext ? `## Current Spec Page Content (truncated)\n${pageContext}` : ""}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "fact_check_result",
              description: "Return the fact-check assessment and suggested updates",
              parameters: {
                type: "object",
                properties: {
                  is_valid: { type: "boolean", description: "Whether the feedback appears valid" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  reasoning: { type: "string", description: "Explanation of the assessment" },
                  suggested_updates: {
                    type: "object",
                    description: "Field updates to apply if valid. Only include fields that need changing.",
                    properties: {
                      title: { type: "string" },
                      acronym: { type: "string" },
                      description: { type: "string" },
                      organization: { type: "string" },
                      status: { type: "string", enum: ["Backlog", "Emerging", "Draft", "Approved"] },
                      tags: { type: "array", items: { type: "string" } },
                    },
                  },
                },
                required: ["is_valid", "confidence", "reasoning", "suggested_updates"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "fact_check_result" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit reached. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI fact-check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ success: false, error: "AI could not produce a fact-check" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fact-check error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
