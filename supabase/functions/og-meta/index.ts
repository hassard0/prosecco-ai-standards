import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = "https://prosecco.dev";
const DEFAULT_OG_IMAGE = "https://prosecco.dev/og-image.png";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

serve(async (req) => {
  const url = new URL(req.url);
  const standardId = url.searchParams.get("id");

  if (!standardId) {
    return new Response("Missing id parameter", { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: standard, error } = await supabase
      .from("standards")
      .select("id, title, acronym, description, status, organization, tags, logo_url")
      .eq("id", standardId)
      .single();

    if (error || !standard) {
      // Fallback to default meta
      return serveFallbackHtml(standardId);
    }

    const title = standard.acronym
      ? `${standard.title} (${standard.acronym}) | Prosecco`
      : `${standard.title} | Prosecco`;
    const description = truncate(standard.description || "AI Standards Directory", 155);
    const canonicalUrl = `${SITE_URL}/standard/${standard.id}`;
    const ogImage = standard.logo_url || DEFAULT_OG_IMAGE;

    const statusLabel = standard.status || "Emerging";
    const org = standard.organization || "";
    const tags = (standard.tags || []).slice(0, 5).join(", ");

    // Build a richer description for OG
    let ogDesc = description;
    if (org) {
      ogDesc = `${statusLabel} standard by ${org}. ${ogDesc}`;
    }
    ogDesc = truncate(ogDesc, 200);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(ogDesc)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(ogDesc)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:site_name" content="Prosecco - AI Standards Directory" />
  ${tags ? `<meta property="article:tag" content="${escapeHtml(tags)}" />` : ""}
  ${org ? `<meta property="article:author" content="${escapeHtml(org)}" />` : ""}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@proseccodev" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />

  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <!-- Redirect browsers to the SPA -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}" />
</head>
<body>
  <h1>${escapeHtml(standard.title)}</h1>
  ${standard.acronym ? `<p><strong>${escapeHtml(standard.acronym)}</strong></p>` : ""}
  <p>${escapeHtml(description)}</p>
  ${org ? `<p>Organization: ${escapeHtml(org)}</p>` : ""}
  <p>Status: ${escapeHtml(statusLabel)}</p>
  <p><a href="${escapeHtml(canonicalUrl)}">View on Prosecco</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("og-meta error:", err);
    return serveFallbackHtml(standardId);
  }
});

function serveFallbackHtml(standardId: string) {
  const canonicalUrl = `${SITE_URL}/standard/${standardId}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Prosecco: AI Standards Directory</title>
  <meta property="og:title" content="Prosecco: AI Standards Directory" />
  <meta property="og:description" content="AI Standards Directory - Keep up to date on the latest in AI" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${DEFAULT_OG_IMAGE}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}" />
</head>
<body><p>Redirecting...</p></body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
