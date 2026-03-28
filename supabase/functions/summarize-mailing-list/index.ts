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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    // SECURITY: Require admin/contributor authentication or cron secret
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
    const isCron = cronSecret && token === cronSecret;

    if (!isServiceRole && !isCron) {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ success: false, error: "Invalid session" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const hasAccess = (roles || []).some((r) => r.role === "admin" || r.role === "contributor");
      if (!hasAccess) {
        return new Response(JSON.stringify({ success: false, error: "Admin or contributor access required" }), {
          status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Optionally accept a single standard_id
    let targetStandardId: string | null = null;
    try {
      const body = await req.json();
      targetStandardId = body?.standard_id || null;
    } catch { /* no body is fine */ }

    // Find standards with resources
    let query = supabase
      .from("standards")
      .select("id, title, resources")
      .not("resources", "is", null);

    if (targetStandardId) {
      query = query.eq("id", targetStandardId);
    }

    const { data: standards, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const results: { standard_id: string; url: string; status: string }[] = [];

    for (const standard of standards || []) {
      const resources = (standard.resources as any[]) || [];
      // Process all resource types that have URLs
      const processable = resources.filter((r: any) => r.url);

      if (processable.length === 0) continue;

      // Collect all resource URLs for a combined summary
      const primaryUrl = processable[0].url;

      try {
        // Check if we already have a recent summary (less than 24h old)
        const { data: existing } = await supabase
          .from("standard_summaries")
          .select("generated_at")
          .eq("standard_id", standard.id)
          .eq("source_url", primaryUrl)
          .single();

        if (existing) {
          const age = Date.now() - new Date(existing.generated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            results.push({ standard_id: standard.id, url: primaryUrl, status: "cached" });
            continue;
          }
        }

        // Fetch content from all resources (up to 5)
        const contentParts: string[] = [];
        for (const res of processable.slice(0, 5)) {
          try {
            const pageRes = await fetch(res.url, {
              headers: { "User-Agent": "Prosecco.dev Standards Bot/1.0" },
            });
            if (pageRes.ok) {
              const text = (await pageRes.text()).slice(0, 15000);
              contentParts.push(`--- Resource: ${res.label || res.type} (${res.url}) ---\n${text}`);
            }
          } catch { /* skip failed fetches */ }
        }

        if (contentParts.length === 0) {
          results.push({ standard_id: standard.id, url: primaryUrl, status: "no_content" });
          continue;
        }

        const combinedContent = contentParts.join("\n\n").slice(0, 50000);

        // AI call to generate summary, what's new, and timeline
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            tools: [
              {
                type: "function",
                function: {
                  name: "generate_standard_summary",
                  description: "Generate a structured summary with what's new and timeline for a technology standard",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: {
                        type: "string",
                        description: "A clear, structured markdown summary (300-500 words) covering key topics, decisions, open questions, and deadlines",
                      },
                      whats_new: {
                        type: "string",
                        description: "A concise markdown section (100-200 words) highlighting the most recent changes, updates, or announcements. Focus on what happened in the last few weeks/months.",
                      },
                      timeline_events: {
                        type: "array",
                        description: "Chronological events related to this standard. Extract dates and milestones from the content. Include version releases, specification drafts, key decisions, meetings, deadlines.",
                        items: {
                          type: "object",
                          properties: {
                            date: { type: "string", description: "ISO date string (YYYY-MM-DD) or approximate (YYYY-MM or YYYY)" },
                            title: { type: "string", description: "Short event title (5-10 words)" },
                            description: { type: "string", description: "Brief description (1-2 sentences)" },
                            type: { type: "string", enum: ["release", "draft", "decision", "meeting", "deadline", "milestone", "other"] },
                          },
                          required: ["date", "title", "type"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["summary", "whats_new", "timeline_events"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "generate_standard_summary" } },
            messages: [
              {
                role: "system",
                content: `You analyze technology standard resources (mailing lists, GitHub repos, documentation, blogs) and produce structured intelligence.
Extract chronological events wherever possible — look for dates, version numbers, meeting notes, release announcements, specification drafts, and deadlines.
For "what's new", focus on the most recent activity and changes.
Use markdown formatting in summary and whats_new fields.`,
              },
              {
                role: "user",
                content: `Analyze these resources for the standard "${standard.title}" and extract a summary, what's new, and timeline events:\n\n${combinedContent}`,
              },
            ],
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error("AI error:", aiRes.status, errText);
          results.push({ standard_id: standard.id, url: primaryUrl, status: `ai_failed_${aiRes.status}` });
          continue;
        }

        const aiData = await aiRes.json();
        let extracted: any = null;

        try {
          const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          extracted = typeof args === "string" ? JSON.parse(args) : args;
        } catch {
          // Fallback: try content as plain text
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            extracted = { summary: content, whats_new: null, timeline_events: [] };
          }
        }

        if (!extracted?.summary) {
          results.push({ standard_id: standard.id, url: primaryUrl, status: "no_summary" });
          continue;
        }

        // Sort timeline events by date
        const timelineEvents = (extracted.timeline_events || []).sort(
          (a: any, b: any) => (b.date || "").localeCompare(a.date || "")
        );

        // Upsert summary
        const { error: upsertErr } = await supabase
          .from("standard_summaries")
          .upsert(
            {
              standard_id: standard.id,
              source_url: primaryUrl,
              summary: extracted.summary,
              whats_new: extracted.whats_new || null,
              timeline_events: timelineEvents,
              generated_at: new Date().toISOString(),
            },
            { onConflict: "standard_id,source_url" }
          );

        if (upsertErr) {
          results.push({ standard_id: standard.id, url: primaryUrl, status: `upsert_failed: ${upsertErr.message}` });
        } else {
          results.push({ standard_id: standard.id, url: primaryUrl, status: "updated" });
        }
      } catch (e) {
        results.push({ standard_id: standard.id, url: primaryUrl, status: `error: ${e.message}` });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
