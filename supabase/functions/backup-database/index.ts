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
  const headers: Record<string, string> = {
    Authorization: `token ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "prosecco-backup-export",
    "Content-Type": "application/json",
  };
  const apiBase = `https://api.github.com/repos/${githubRepo}`;

  try {
    // Verify repo access
    const repoRes = await fetch(apiBase, { headers });
    if (!repoRes.ok) {
      const text = await repoRes.text();
      return { success: false, error: `Failed to access repo: ${repoRes.status} ${text}` };
    }
    await repoRes.json(); // consume body

    // Get existing files in data/standards/ to find their SHAs (needed for updates)
    const existingShas = new Map<string, string>();
    const listRes = await fetch(`${apiBase}/contents/data/standards`, { headers });
    if (listRes.ok) {
      const files = await listRes.json();
      if (Array.isArray(files)) {
        for (const f of files) {
          existingShas.set(f.name, f.sha);
        }
      }
    } else {
      await listRes.text(); // consume body
    }

    // Upload each standard via Contents API
    let exported = 0;
    const errors: string[] = [];

    for (const std of standards) {
      const id = std.id as string;
      const title = std.title as string;
      const acronym = std.acronym as string | null;
      const summary = summariesByStandard.get(id) || null;
      const md = generateMarkdown(std, summary);
      const filename = `${id}_${sanitizeFilename(title, acronym)}.md`;
      const filePath = `data/standards/${filename}`;

      // Base64 encode content
      const content = btoa(unescape(encodeURIComponent(md)));

      const body: Record<string, string> = {
        message: `Update ${filename}`,
        content,
      };

      // If file already exists, include its SHA
      const existingSha = existingShas.get(filename);
      if (existingSha) {
        body.sha = existingSha;
      }

      const putRes = await fetch(`${apiBase}/contents/${filePath}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });

      if (putRes.ok) {
        exported++;
        await putRes.json(); // consume body
      } else {
        const text = await putRes.text();
        errors.push(`${filename}: ${putRes.status} ${text}`);
        // Stop on auth errors
        if (putRes.status === 401 || putRes.status === 403) {
          return { success: false, error: `Auth failed on file upload: ${putRes.status} ${text}` };
        }
      }
    }

    // Clean up files in data/standards/ that no longer correspond to a standard
    const currentFilenames = new Set(
      standards.map((std) => {
        const id = std.id as string;
        const title = std.title as string;
        const acronym = std.acronym as string | null;
        return `${id}_${sanitizeFilename(title, acronym)}.md`;
      })
    );

    for (const [name, sha] of existingShas) {
      if (!currentFilenames.has(name)) {
        const delRes = await fetch(`${apiBase}/contents/data/standards/${name}`, {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            message: `Remove ${name}`,
            sha,
          }),
        });
        await delRes.text(); // consume body
      }
    }

    if (errors.length > 0 && exported === 0) {
      return { success: false, error: errors.join("; ") };
    }

    return { success: true, files_exported: exported, error: errors.length > 0 ? `${errors.length} files failed` : undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
            ref: `refs/heads/${branch}`,
            sha: newCommitData.sha,
          }),
        });

    if (!refUpdateRes.ok) {
      const text = await refUpdateRes.text();
      return { success: false, error: `Failed to update branch ref: ${refUpdateRes.status} ${text}` };
    }

    return { success: true, files_exported: markdownEntries.length };
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
