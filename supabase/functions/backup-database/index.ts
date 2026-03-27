import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sanitizeFilename(title: string, acronym?: string | null): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return acronym ? `${slug}_${acronym}` : slug;
}

interface Author {
  name?: string;
  company?: string;
  role?: string;
  url?: string;
}

interface Resource {
  type?: string;
  label?: string;
  url?: string;
}

interface TimelineEvent {
  date?: string;
  type?: string;
  title?: string;
  description?: string;
}

function generateMarkdown(
  standard: Record<string, unknown>,
  summary?: Record<string, unknown> | null
): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`id: ${standard.id}`);
  lines.push(`title: "${(standard.title as string || "").replace(/"/g, '\\"')}"`);
  if (standard.acronym) lines.push(`acronym: ${standard.acronym}`);
  lines.push(`status: ${standard.status}`);
  if (standard.organization) lines.push(`organization: "${(standard.organization as string).replace(/"/g, '\\"')}"`);
  const tags = (standard.tags as string[]) || [];
  if (tags.length) lines.push(`tags: [${tags.join(", ")}]`);
  if (standard.link) lines.push(`link: ${standard.link}`);
  lines.push(`expired: ${standard.is_expired || false}`);
  lines.push(`created_at: ${standard.created_at}`);
  lines.push(`updated_at: ${standard.updated_at}`);
  lines.push("---");
  lines.push("");

  // Title
  const heading = standard.acronym
    ? `# ${standard.title} (${standard.acronym})`
    : `# ${standard.title}`;
  lines.push(heading);
  lines.push("");

  const meta: string[] = [];
  meta.push(`**Status:** ${standard.status}`);
  if (standard.organization) meta.push(`**Organization:** ${standard.organization}`);
  if (standard.is_expired) meta.push("**⚠️ Expired**");
  lines.push(meta.join(" | "));
  lines.push("");

  // Description
  lines.push("## Description");
  lines.push(String(standard.description || ""));
  lines.push("");

  // Authors
  const authors = (standard.authors as Author[]) || [];
  if (authors.length) {
    lines.push("## Authors");
    lines.push("| Name | Company | Role | Profile |");
    lines.push("|------|---------|------|---------|");
    for (const a of authors) {
      const profile = a.url ? `[link](${a.url})` : "";
      lines.push(`| ${a.name || ""} | ${a.company || ""} | ${a.role || ""} | ${profile} |`);
    }
    lines.push("");
  }

  // Resources
  const resources = (standard.resources as Resource[]) || [];
  if (resources.length) {
    lines.push("## Resources");
    lines.push("| Type | Label | URL |");
    lines.push("|------|-------|-----|");
    for (const r of resources) {
      lines.push(`| ${r.type || ""} | ${r.label || ""} | ${r.url || ""} |`);
    }
    lines.push("");
  }

  // Tags
  if (tags.length) {
    lines.push("## Tags");
    lines.push(tags.join(", "));
    lines.push("");
  }

  // Summary
  if (summary?.summary) {
    lines.push("## Latest Summary");
    lines.push(String(summary.summary));
    lines.push("");
  }

  // What's New
  if (summary?.whats_new) {
    lines.push("## What's New");
    lines.push(String(summary.whats_new));
    lines.push("");
  }

  // Timeline
  const events = (summary?.timeline_events as TimelineEvent[]) || [];
  if (events.length) {
    lines.push("## Timeline");
    lines.push("| Date | Type | Title | Description |");
    lines.push("|------|------|-------|-------------|");
    for (const e of events) {
      lines.push(`| ${e.date || ""} | ${e.type || ""} | ${e.title || ""} | ${e.description || ""} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function exportToGitHub(
  standards: Record<string, unknown>[],
  summariesByStandard: Map<string, Record<string, unknown>>,
  githubToken: string,
  githubRepo: string
): Promise<{ success: boolean; error?: string; files_exported?: number }> {
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
  const apiBase = `https://api.github.com/repos/${githubRepo}`;

  try {
    // 1. Get current commit SHA — try main, then master
    let branch = "main";
    let refRes = await fetch(`${apiBase}/git/ref/heads/main`, { headers });
    if (!refRes.ok) {
      branch = "master";
      refRes = await fetch(`${apiBase}/git/ref/heads/master`, { headers });
    }
    if (!refRes.ok) {
      const text = await refRes.text();
      return { success: false, error: `Failed to get ref (tried main & master): ${refRes.status} ${text}` };
    }
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get the current commit to find its tree
    const commitRes = await fetch(`${apiBase}/git/commits/${currentCommitSha}`, { headers });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs and tree entries for all standards
    const treeEntries: { path: string; mode: string; type: string; content: string }[] = [];

    for (const std of standards) {
      const id = std.id as string;
      const title = std.title as string;
      const acronym = std.acronym as string | null;
      const summary = summariesByStandard.get(id) || null;
      const md = generateMarkdown(std, summary);
      const filename = `${id}_${sanitizeFilename(title, acronym)}.md`;

      treeEntries.push({
        path: `data/standards/${filename}`,
        mode: "100644",
        type: "blob",
        content: md,
      });
    }

    // 4. Create tree (using base_tree to preserve other files in repo)
    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      const text = await treeRes.text();
      return { success: false, error: `Failed to create tree: ${treeRes.status} ${text}` };
    }
    const treeData = await treeRes.json();

    // 5. Create commit
    const commitMsg = `Daily standards export - ${new Date().toISOString().split("T")[0]}`;
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: commitMsg,
        tree: treeData.sha,
        parents: [currentCommitSha],
      }),
    });
    if (!newCommitRes.ok) {
      const text = await newCommitRes.text();
      return { success: false, error: `Failed to create commit: ${newCommitRes.status} ${text}` };
    }
    const newCommitData = await newCommitRes.json();

    // 6. Update ref
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/main`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommitData.sha }),
    });
    if (!updateRefRes.ok) {
      const text = await updateRefRes.text();
      return { success: false, error: `Failed to update ref: ${updateRefRes.status} ${text}` };
    }

    return { success: true, files_exported: treeEntries.length };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const tables = [
      "standards",
      "standard_summaries",
      "standard_flags",
      "tags",
      "user_roles",
    ];

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupData: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
      } else {
        backupData[table] = data || [];
      }
    }

    const payload = JSON.stringify(
      {
        created_at: new Date().toISOString(),
        tables: backupData,
        row_counts: Object.fromEntries(
          Object.entries(backupData).map(([k, v]) => [k, v.length])
        ),
      },
      null,
      2
    );

    const filePath = `daily/${timestamp}.json`;

    const { error: uploadError } = await supabase.storage
      .from("backups")
      .upload(filePath, new Blob([payload], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Clean up backups older than 30 days
    const { data: files } = await supabase.storage
      .from("backups")
      .list("daily", { sortBy: { column: "created_at", order: "asc" } });

    if (files && files.length > 30) {
      const toDelete = files.slice(0, files.length - 30).map((f) => `daily/${f.name}`);
      await supabase.storage.from("backups").remove(toDelete);
    }

    // GitHub Markdown Export (opt-in)
    let githubResult: { success: boolean; error?: string; files_exported?: number } | undefined;
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const githubRepo = Deno.env.get("GITHUB_REPO");

    if (githubToken && githubRepo) {
      // Build summaries map: latest summary per standard_id
      const summariesByStandard = new Map<string, Record<string, unknown>>();
      const summaries = (backupData["standard_summaries"] || []) as Record<string, unknown>[];
      for (const s of summaries) {
        const sid = s.standard_id as string;
        const existing = summariesByStandard.get(sid);
        if (!existing || (s.generated_at as string) > (existing.generated_at as string)) {
          summariesByStandard.set(sid, s);
        }
      }

      const standards = (backupData["standards"] || []) as Record<string, unknown>[];
      githubResult = await exportToGitHub(standards, summariesByStandard, githubToken, githubRepo);
    }

    const result = {
      success: true,
      file: filePath,
      row_counts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, v.length])
      ),
      errors: errors.length > 0 ? errors : undefined,
      github_export: githubResult,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
