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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all standards that have a mailing_list resource
    const { data: standards, error: fetchErr } = await supabase
      .from("standards")
      .select("id, title, resources")
      .not("resources", "is", null);

    if (fetchErr) throw fetchErr;

    const results: { standard_id: string; url: string; status: string }[] = [];

    for (const standard of standards || []) {
      const resources = (standard.resources as any[]) || [];
      const mailingLists = resources.filter((r: any) => r.type === "mailing_list" && r.url);

      for (const ml of mailingLists) {
        try {
          // Check if we already have a recent summary (less than 24h old)
          const { data: existing } = await supabase
            .from("standard_summaries")
            .select("generated_at")
            .eq("standard_id", standard.id)
            .eq("source_url", ml.url)
            .single();

          if (existing) {
            const age = Date.now() - new Date(existing.generated_at).getTime();
            if (age < 24 * 60 * 60 * 1000) {
              results.push({ standard_id: standard.id, url: ml.url, status: "cached" });
              continue;
            }
          }

          // Fetch the mailing list page
          const pageRes = await fetch(ml.url, {
            headers: { "User-Agent": "Prosecco.dev Standards Bot/1.0" },
          });
          if (!pageRes.ok) {
            results.push({ standard_id: standard.id, url: ml.url, status: `fetch_failed_${pageRes.status}` });
            continue;
          }

          const content = (await pageRes.text()).slice(0, 40000);

          // Summarize with AI
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
                  content: `You summarize mailing list or forum discussions about technology standards. 
Produce a clear, structured summary covering:
- Key topics and threads from recent discussions
- Notable decisions or consensus points
- Open questions or debates
- Any upcoming deadlines or milestones mentioned
Keep it concise (300-500 words). Use markdown formatting.`,
                },
                {
                  role: "user",
                  content: `Summarize the recent discussions from this mailing list for the standard "${standard.title}":\n\n${content}`,
                },
              ],
            }),
          });

          if (!aiRes.ok) {
            results.push({ standard_id: standard.id, url: ml.url, status: `ai_failed_${aiRes.status}` });
            continue;
          }

          const aiData = await aiRes.json();
          const summary = aiData.choices?.[0]?.message?.content;

          if (!summary) {
            results.push({ standard_id: standard.id, url: ml.url, status: "no_summary" });
            continue;
          }

          // Upsert summary
          const { error: upsertErr } = await supabase
            .from("standard_summaries")
            .upsert(
              {
                standard_id: standard.id,
                source_url: ml.url,
                summary,
                generated_at: new Date().toISOString(),
              },
              { onConflict: "standard_id,source_url" }
            );

          if (upsertErr) {
            results.push({ standard_id: standard.id, url: ml.url, status: `upsert_failed: ${upsertErr.message}` });
          } else {
            results.push({ standard_id: standard.id, url: ml.url, status: "updated" });
          }
        } catch (e) {
          results.push({ standard_id: standard.id, url: ml.url, status: `error: ${e.message}` });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
