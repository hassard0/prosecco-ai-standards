import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE = "https://prosecco-ai-standards.lovable.app";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const full = url.searchParams.get("full") === "true" || format === "json";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: standards, error } = await supabase
      .from("standards")
      .select("*")
      .order("title");

    if (error) throw error;

    // Fetch summaries for full version
    let summariesByStandard: Record<string, { summary: string; whats_new: string | null; generated_at: string }> = {};
    if (full) {
      const { data: summaries } = await supabase
        .from("standard_summaries")
        .select("standard_id, summary, whats_new, generated_at")
        .order("generated_at", { ascending: false });

      if (summaries) {
        for (const s of summaries) {
          // Keep only the latest summary per standard
          if (!summariesByStandard[s.standard_id]) {
            summariesByStandard[s.standard_id] = { summary: s.summary, whats_new: s.whats_new, generated_at: s.generated_at };
          }
        }
      }
    }

    const lines: string[] = [];

    // ── Header ──
    lines.push("# Prosecco.dev — AI Standards Directory");
    lines.push("");
    lines.push("> A curated, open directory of AI agent interoperability standards, protocols, and specifications.");
    lines.push("> Maintained by the community to help developers, researchers, and organizations navigate the evolving AI standards landscape.");
    lines.push("");

    lines.push("## About");
    lines.push("");
    lines.push("Prosecco.dev tracks emerging and approved standards for AI agent communication,");
    lines.push("tool use, identity, and interoperability. Each standard is categorized by maturity");
    lines.push("status (Backlog → Emerging → Draft → Approved), tagged by topic area, and linked");
    lines.push("to its primary specification, community channels, and reference implementations.");
    lines.push("");

    lines.push("## Site Map");
    lines.push("");
    lines.push(`- Homepage: ${SITE}/`);
    lines.push(`- Standards Radar (visual overview): ${SITE}/radar`);
    lines.push(`- Timeline (activity over time): ${SITE}/timeline`);
    lines.push(`- Affiliations (organizations & authors): ${SITE}/affiliations`);
    lines.push(`- llms.txt: ${SITE}/llms.txt`);
    lines.push(`- llms-full.txt: ${SITE}/llms-full.txt`);
    lines.push("");

    if (!standards || standards.length === 0) {
      lines.push("No standards found.");
    } else {
      // Collect stats
      const statusOrder = ["Approved", "Draft", "Emerging", "Backlog"] as const;
      const grouped: Record<string, typeof standards> = {};
      const allTags = new Set<string>();
      const allOrgs = new Set<string>();

      for (const s of standards) {
        const status = s.status || "Emerging";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(s);
        if (s.tags) for (const t of s.tags) allTags.add(t);
        if (s.organization) allOrgs.add(s.organization);
      }

      // Summary stats
      lines.push("## Overview");
      lines.push("");
      lines.push(`- Total standards tracked: **${standards.length}**`);
      for (const status of statusOrder) {
        const count = grouped[status]?.length ?? 0;
        if (count > 0) lines.push(`- ${status}: ${count}`);
      }
      lines.push(`- Organizations: ${allOrgs.size} (${[...allOrgs].sort().join(", ")})`);
      lines.push(`- Topic tags: ${[...allTags].sort().join(", ")}`);
      lines.push("");

      // ── Standards index (always shown) ──
      lines.push("## Standards Index");
      lines.push("");
      for (const s of standards) {
        const nameStr = s.acronym ? `${s.title} (${s.acronym})` : s.title;
        lines.push(`- [${nameStr}](${SITE}/standard/${s.id}) — ${s.status}${s.organization ? ` · ${s.organization}` : ""}`);
      }
      lines.push("");

      // ── Per-status sections ──
      for (const status of statusOrder) {
        const items = grouped[status];
        if (!items || items.length === 0) continue;

        lines.push(`## ${status} Standards`);
        lines.push("");

        for (const s of items) {
          const nameStr = s.acronym ? `${s.title} (${s.acronym})` : s.title;
          lines.push(`### ${nameStr}`);
          lines.push("");
          lines.push(`- Prosecco page: ${SITE}/standard/${s.id}`);
          if (s.organization) lines.push(`- Organization: ${s.organization}`);
          if (s.link) lines.push(`- Specification: ${s.link}`);
          if (s.tags && s.tags.length > 0) lines.push(`- Tags: ${s.tags.join(", ")}`);
          lines.push(`- Status: ${s.status}`);
          lines.push(`- Last updated: ${s.updated_at ? new Date(s.updated_at).toISOString().split("T")[0] : "unknown"}`);
          lines.push("");

          // Description (always shown — it's short)
          lines.push(s.description);
          lines.push("");

          if (full) {
            // Authors
            const authors = Array.isArray(s.authors) ? s.authors : [];
            if (authors.length > 0) {
              lines.push("**Authors & Contributors:**");
              lines.push("");
              for (const a of authors as { name: string; company?: string; role?: string; url?: string }[]) {
                const parts = [a.name];
                if (a.company && a.company !== "Unknown") parts.push(`(${a.company})`);
                if (a.role) parts.push(`— ${a.role}`);
                if (a.url) parts.push(`[profile](${a.url})`);
                lines.push(`- ${parts.join(" ")}`);
              }
              lines.push("");
            }

            // Resources
            const resources = Array.isArray(s.resources) ? s.resources : [];
            if (resources.length > 0) {
              lines.push("**Resources & Links:**");
              lines.push("");
              for (const r of resources as { type: string; label: string; url: string }[]) {
                const typeLabel = r.type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                lines.push(`- [${r.label || typeLabel}](${r.url}) (${typeLabel})`);
              }
              lines.push("");
            }

            // Summary
            const sumData = summariesByStandard[s.id];
            if (sumData) {
              if (sumData.whats_new) {
                lines.push("**What's New:**");
                lines.push("");
                lines.push(sumData.whats_new);
                lines.push("");
              }
              lines.push("**Discussion Summary:**");
              lines.push("");
              lines.push(sumData.summary);
              lines.push("");
            }
          }

          lines.push("---");
          lines.push("");
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
