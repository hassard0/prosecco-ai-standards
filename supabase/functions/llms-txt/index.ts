import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

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
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: standards, error } = await supabase
      .from("standards")
      .select("*")
      .order("title");

    if (error) throw error;

    const lines: string[] = [];

    // Header
    lines.push("# Prosecco.dev — AI Standards Directory");
    lines.push("");
    lines.push("> A curated directory of AI agent interoperability standards, protocols, and specifications.");
    lines.push("");
    lines.push("## About");
    lines.push("");
    lines.push("Prosecco.dev tracks emerging and approved standards for AI agent communication,");
    lines.push("tool use, identity, and interoperability. Each standard is categorized by status");
    lines.push("(Backlog, Emerging, Draft, Approved), tagged by topic, and linked to its primary");
    lines.push("specification and community resources.");
    lines.push("");
    lines.push(`- Website: https://prosecco-ai-standards.lovable.app`);
    lines.push(`- llms.txt: https://prosecco-ai-standards.lovable.app/llms.txt`);
    lines.push(`- llms-full.txt: https://prosecco-ai-standards.lovable.app/llms-full.txt`);
    lines.push("");

    if (!standards || standards.length === 0) {
      lines.push("No standards found.");
    } else {
      // Group by status
      const statusOrder = ["Approved", "Draft", "Emerging", "Backlog"];
      const grouped: Record<string, typeof standards> = {};
      for (const s of standards) {
        const status = s.status || "Emerging";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(s);
      }

      for (const status of statusOrder) {
        const items = grouped[status];
        if (!items || items.length === 0) continue;

        lines.push(`## ${status} Standards`);
        lines.push("");

        for (const s of items) {
          const nameStr = s.acronym ? `${s.title} (${s.acronym})` : s.title;
          lines.push(`### ${nameStr}`);
          if (s.organization) lines.push(`- Organization: ${s.organization}`);
          if (s.link) lines.push(`- Spec: ${s.link}`);
          if (s.tags && s.tags.length > 0) lines.push(`- Tags: ${s.tags.join(", ")}`);
          lines.push("");

          if (full) {
            // Full version: include description, authors, resources
            lines.push(s.description);
            lines.push("");

            const authors = Array.isArray(s.authors) ? s.authors : [];
            if (authors.length > 0) {
              lines.push("**Authors/Contributors:**");
              for (const a of authors as { name: string; company?: string; role?: string; url?: string }[]) {
                const parts = [a.name];
                if (a.company && a.company !== "Unknown") parts.push(`(${a.company})`);
                if (a.role) parts.push(`— ${a.role}`);
                lines.push(`- ${parts.join(" ")}`);
              }
              lines.push("");
            }

            const resources = Array.isArray(s.resources) ? s.resources : [];
            if (resources.length > 0) {
              lines.push("**Resources:**");
              for (const r of resources as { type: string; label: string; url: string }[]) {
                lines.push(`- [${r.label || r.type}](${r.url})`);
              }
              lines.push("");
            }
          }
        }
      }
    }

    const text = lines.join("\n");

    return new Response(text, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("llms-txt error:", err);
    return new Response("Internal server error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
