import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StandardResource {
  url?: string;
  label?: string;
  type?: string;
}

interface CanonicalContext {
  authoritativeText: string;
  authoritativeUrls: string[];
  officialDomains: string[];
  preferredPrimaryUrl?: string;
  preferredPrimaryReason?: string;
  organizationHint?: string;
  isIetfDraft: boolean;
  latestRevision?: string;
}

const IETF_DOMAINS = ["datatracker.ietf.org", "www.ietf.org", "ietf.org"];
const OFFICIAL_HOST_PATTERNS = [
  /^datatracker\.ietf\.org$/i,
  /(^|\.)ietf\.org$/i,
  /(^|\.)rfc-editor\.org$/i,
  /(^|\.)w3\.org$/i,
  /(^|\.)docs\.oasis-open\.org$/i,
  /(^|\.)openid\.net$/i,
  /(^|\.)oauth\.net$/i,
  /(^|\.)spec\.modelcontextprotocol\.io$/i,
];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function isGithubUrl(value?: string | null) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "github.com" || host === "raw.githubusercontent.com" || host === "gist.github.com";
  } catch {
    return false;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchUrl(url: string): Promise<{ text: string; contentType: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Prosecco QA Bot/1.0)",
      },
    });

    if (!response.ok) {
      console.warn(`Canonical fetch failed [${response.status}] for ${url}`);
      await response.text();
      return { text: "", contentType: "" };
    }

    return {
      text: await response.text(),
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    console.warn(`Canonical fetch error for ${url}:`, error);
    return { text: "", contentType: "" };
  }
}

function cleanFetchedText(text: string, contentType: string, maxChars = 12000) {
  const cleaned = contentType.includes("html")
    ? stripHtml(text)
    : text.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxChars);
}

function extractDraftNameFromText(value?: string | null) {
  if (!value) return undefined;
  const match = value.match(/draft-[a-z0-9-]+/i);
  return match?.[0]?.toLowerCase();
}

function extractIetfDraftName(standard: any) {
  const candidates = [
    standard.link,
    ...(Array.isArray(standard.resources)
      ? standard.resources.map((resource: StandardResource) => resource?.url)
      : []),
    standard.title,
    standard.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const draftName = extractDraftNameFromText(candidate);
    if (draftName) return draftName;
  }

  return undefined;
}

function extractLatestIetfRevision(pageText: string, draftName: string) {
  const matches = [...pageText.matchAll(new RegExp(`${draftName}-(\\d{2})`, "gi"))].map(
    (match) => match[1]
  );

  if (matches.length === 0) return undefined;
  return matches.sort().at(-1);
}

function isLikelyOfficialStandardsUrl(value?: string | null, isIetfDraft = false) {
  if (!value) return false;

  try {
    const host = new URL(value).hostname.toLowerCase();

    if (isIetfDraft) {
      return host === "datatracker.ietf.org" || host === "ietf.org" || host.endsWith(".ietf.org");
    }

    if (isGithubUrl(value)) return false;
    return OFFICIAL_HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function getDemotedLinkLabel(value?: string | null) {
  if (!value) return "Previous Primary Link";
  if (isGithubUrl(value)) return "GitHub Draft Repository";

  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host.includes("drafts.")) return "Author Draft Preview";
    if (host.includes("ietf.org")) return "Previous IETF Archive Link";
  } catch {
    return "Previous Primary Link";
  }

  return "Previous Primary Link";
}

function shouldOverrideWithCanonicalLink(aiSuggestion: string | undefined, canonicalUrl: string) {
  const normalizedAi = normalizeUrl(aiSuggestion);
  const normalizedCanonical = normalizeUrl(canonicalUrl);

  if (!normalizedAi) return true;
  if (normalizedAi === normalizedCanonical) return false;
  if (isGithubUrl(normalizedAi)) return true;
  if (/drafts\./i.test(normalizedAi)) return true;
  if (/\/archive\/id\/draft-.*-\d{2}\.(txt|html)$/i.test(normalizedAi)) return true;

  try {
    const aiHost = new URL(normalizedAi).hostname.toLowerCase();
    const canonicalHost = new URL(normalizedCanonical).hostname.toLowerCase();
    return aiHost !== canonicalHost;
  } catch {
    return true;
  }
}

async function buildCanonicalContext(standard: any): Promise<CanonicalContext> {
  const authoritativeUrls: string[] = [];
  const authoritativeSections: string[] = [];
  const officialDomains = new Set<string>();
  const currentUrls = uniqueStrings([
    standard.link,
    ...(Array.isArray(standard.resources)
      ? standard.resources.map((resource: StandardResource) => resource?.url)
      : []),
  ]);

  const draftName = extractIetfDraftName(standard);
  const isIetfDraft = Boolean(
    draftName ||
      currentUrls.some((url) => /datatracker\.ietf\.org|(^|\.)ietf\.org/i.test(url))
  );

  let preferredPrimaryUrl: string | undefined;
  let preferredPrimaryReason: string | undefined;
  let latestRevision: string | undefined;
  let organizationHint: string | undefined;

  if (isIetfDraft) {
    organizationHint = "IETF";
    IETF_DOMAINS.forEach((domain) => officialDomains.add(domain));

    if (draftName) {
      preferredPrimaryUrl = `https://datatracker.ietf.org/doc/${draftName}/`;

      const datatracker = await fetchUrl(preferredPrimaryUrl);
      if (datatracker.text) {
        authoritativeUrls.push(preferredPrimaryUrl);
        authoritativeSections.push(
          `Official IETF Datatracker page (${preferredPrimaryUrl}):\n${cleanFetchedText(
            datatracker.text,
            datatracker.contentType,
            14000
          )}`
        );
        latestRevision = extractLatestIetfRevision(datatracker.text, draftName);
      }

      if (latestRevision) {
        const archiveHtmlUrl = `https://www.ietf.org/archive/id/${draftName}-${latestRevision}.html`;
        const archiveTxtUrl = `https://www.ietf.org/archive/id/${draftName}-${latestRevision}.txt`;

        const archiveHtml = await fetchUrl(archiveHtmlUrl);
        if (archiveHtml.text) {
          authoritativeUrls.push(archiveHtmlUrl);
          authoritativeSections.push(
            `Latest IETF draft HTML (${archiveHtmlUrl}):\n${cleanFetchedText(
              archiveHtml.text,
              archiveHtml.contentType,
              9000
            )}`
          );
        }

        const archiveTxt = await fetchUrl(archiveTxtUrl);
        if (archiveTxt.text) {
          authoritativeUrls.push(archiveTxtUrl);
          authoritativeSections.push(
            `Latest IETF draft text (${archiveTxtUrl}):\n${cleanFetchedText(
              archiveTxt.text,
              archiveTxt.contentType || "text/plain",
              9000
            )}`
          );
        }

        preferredPrimaryReason = `Official IETF Datatracker page tracks this draft, and the latest visible revision is ${draftName}-${latestRevision}.`;
      } else {
        preferredPrimaryReason =
          "Official IETF Datatracker page tracks the latest draft revision and is the canonical root document.";
      }
    }
  }

  let fetchedOfficialCount = 0;
  for (const url of currentUrls) {
    if (!isLikelyOfficialStandardsUrl(url, isIetfDraft)) continue;
    if (preferredPrimaryUrl && normalizeUrl(url) === normalizeUrl(preferredPrimaryUrl)) continue;
    if (fetchedOfficialCount >= 3) break;

    try {
      officialDomains.add(new URL(url).hostname.toLowerCase());
    } catch {
      // Ignore malformed URLs here; fetchUrl will already handle them.
    }

    const fetched = await fetchUrl(url);
    if (!fetched.text) continue;

    authoritativeUrls.push(url);
    authoritativeSections.push(
      `Official source (${url}):\n${cleanFetchedText(fetched.text, fetched.contentType, 8000)}`
    );
    fetchedOfficialCount += 1;

    if (!preferredPrimaryUrl && !isGithubUrl(url)) {
      preferredPrimaryUrl = url;
      preferredPrimaryReason ||= "This appears to be the most authoritative official source currently linked.";
    }
  }

  return {
    authoritativeText: authoritativeSections.join("\n\n"),
    authoritativeUrls: uniqueStrings(authoritativeUrls),
    officialDomains: uniqueStrings(Array.from(officialDomains)),
    preferredPrimaryUrl,
    preferredPrimaryReason,
    organizationHint,
    isIetfDraft,
    latestRevision,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
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
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const hasAccess = roles?.some(
      (role: any) => role.role === "admin" || role.role === "contributor"
    );
    if (!hasAccess) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { standard_id } = await req.json();
    if (!standard_id) {
      return jsonResponse({ error: "standard_id is required" }, 400);
    }

    const { data: standard, error: stdError } = await serviceClient
      .from("standards")
      .select("*")
      .eq("id", standard_id)
      .single();

    if (stdError || !standard) {
      return jsonResponse({ error: "Standard not found" }, 404);
    }

    const { data: summaries } = await serviceClient
      .from("standard_summaries")
      .select("timeline_events")
      .eq("standard_id", standard_id);

    const existingTimeline =
      summaries?.flatMap((summary: any) => summary.timeline_events || []) || [];

    const canonicalContext = await buildCanonicalContext(standard);
    console.log("Canonical QA context:", {
      preferredPrimaryUrl: canonicalContext.preferredPrimaryUrl,
      organizationHint: canonicalContext.organizationHint,
      isIetfDraft: canonicalContext.isIetfDraft,
      latestRevision: canonicalContext.latestRevision,
      officialDomains: canonicalContext.officialDomains,
    });

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      return jsonResponse({ error: "PERPLEXITY_API_KEY is not configured" }, 500);
    }

    const searchQuery = [
      `"${standard.title}"`,
      standard.acronym ? `"${standard.acronym}"` : "",
      canonicalContext.preferredPrimaryUrl ? `"${canonicalContext.preferredPrimaryUrl}"` : "",
      "official specification authors organization timeline latest draft revision",
    ]
      .filter(Boolean)
      .join(" ");

    console.log("Perplexity search:", searchQuery);

    const searchPayload: Record<string, unknown> = {
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant verifying a standards directory. Prefer official standards-body documents over GitHub repos, personal draft sites, blog posts, and author bios. Never infer the owning organization from a repository owner, author affiliation, or labels like 'Independent'. For IETF Internet-Drafts and RFCs, prefer datatracker.ietf.org and ietf.org archive pages.",
        },
        {
          role: "user",
          content: `Research this standard/specification using authoritative sources.\n\nTitle: ${standard.title}\n${standard.acronym ? `Acronym: ${standard.acronym}\n` : ""}${standard.organization ? `Current organization: ${standard.organization}\n` : ""}${standard.link ? `Current primary link: ${standard.link}\n` : ""}${canonicalContext.preferredPrimaryUrl ? `Canonical link candidate: ${canonicalContext.preferredPrimaryUrl}\n` : ""}${canonicalContext.organizationHint ? `Canonical organization hint: ${canonicalContext.organizationHint}\n` : ""}\nProvide:\n1. The correct owning organization of the standard\n2. The best canonical primary document URL\n3. All known authors/editors/contributors with affiliations\n4. Key timeline events and the latest visible draft or revision\n5. Any evidence that the current record is incorrect`,
        },
      ],
      search_recency_filter: "year",
    };

    if (canonicalContext.officialDomains.length > 0) {
      searchPayload.search_domain_filter = canonicalContext.officialDomains;
    }

    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchPayload),
    });

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text();
      console.error("Perplexity error:", perplexityRes.status, errText);
      if (perplexityRes.status === 429) {
        return jsonResponse({ error: "Search rate limited, try again later" }, 429);
      }
      return jsonResponse({ error: "Search failed" }, 500);
    }

    const perplexityData = await perplexityRes.json();
    const researchContent = perplexityData.choices?.[0]?.message?.content || "";
    const citations = uniqueStrings([
      ...canonicalContext.authoritativeUrls,
      ...(perplexityData.citations || []),
    ]);

    console.log("Perplexity research length:", researchContent.length);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY is not configured" }, 500);
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
              content:
                "You are a meticulous fact-checker for a directory of AI interoperability standards. Prioritize official standards-body documents over search summaries. The organization field means the owning standards body or official steward, not the author's employer, not the repository owner, and not a stream label like 'Independent'. For IETF drafts, the canonical primary link is the Datatracker document page, and the organization should be IETF.",
            },
            {
              role: "user",
              content: `## Current Database Record\n\nTitle: ${standard.title}\nAcronym: ${standard.acronym || "(none)"}\nOrganization: ${currentOrg || "(none)"}\nDescription: ${standard.description}\nStatus: ${standard.status}\nPrimary Link: ${standard.link || "(none)"}\n\nCurrent Resources:\n${JSON.stringify(standard.resources || [], null, 2)}\n\nCurrent Authors:\n${currentAuthors.length > 0 ? JSON.stringify(currentAuthors, null, 2) : "(none)"}\n\nCurrent Timeline Events:\n${existingTimeline.length > 0 ? JSON.stringify(existingTimeline, null, 2) : "(none)"}\n\n## Canonical Hints\n\nCanonical organization hint: ${canonicalContext.organizationHint || "(none)"}\nCanonical primary link candidate: ${canonicalContext.preferredPrimaryUrl || "(none)"}\nCanonical link reason: ${canonicalContext.preferredPrimaryReason || "(none)"}\nLatest visible revision: ${canonicalContext.latestRevision || "(unknown)"}\n\n## Authoritative Source Evidence\n\n${canonicalContext.authoritativeText || "(none)"}\n\n## Web Research Summary\n\n${researchContent}\n\n## Instructions\n\nCompare the research against the current record. Use the extract_qa_results tool to return structured corrections. Only include fields where you have HIGH CONFIDENCE that a correction is needed. For authors, include all authors you can identify from the authoritative sources. For timeline, include all events with specific dates that are supported by the evidence.\n\nFor the link field, suggest the best canonical root specification URL, not a GitHub repository, not a personal draft preview, and not a revision-specific archive page when a better root document exists. If you suggest a new primary link, the current primary link will become a resource.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_qa_results",
                description: "Extract structured QA corrections for a standard",
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
                              date: {
                                type: "string",
                                description: "ISO date string YYYY-MM-DD or YYYY-MM",
                              },
                              title: { type: "string" },
                              description: { type: "string" },
                              type: {
                                type: "string",
                                enum: [
                                  "release",
                                  "draft",
                                  "decision",
                                  "meeting",
                                  "deadline",
                                  "milestone",
                                  "other",
                                ],
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
                      description:
                        "Suggest a better primary specification URL if found. The current link will be demoted to a resource.",
                      properties: {
                        suggested: {
                          type: "string",
                          description: "The better canonical URL",
                        },
                        suggested_label: {
                          type: "string",
                          description:
                            "Label for the old link when moved to resources, e.g. 'Original Link'",
                        },
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
        return jsonResponse({ error: "AI rate limited, try again later" }, 429);
      }
      if (geminiRes.status === 402) {
        return jsonResponse(
          {
            error: "AI credits exhausted. Add funds in Settings > Workspace > Usage.",
          },
          402
        );
      }
      return jsonResponse({ error: "AI analysis failed" }, 500);
    }

    const geminiData = await geminiRes.json();
    const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return jsonResponse({ error: "AI did not return structured results" }, 500);
    }

    let qaResults: any;
    try {
      qaResults =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
    } catch {
      return jsonResponse({ error: "Failed to parse AI results" }, 500);
    }

    if (canonicalContext.isIetfDraft) {
      if (normalizeText(currentOrg) !== "ietf") {
        qaResults.organization = {
          current: currentOrg,
          suggested: "IETF",
          reason: `${canonicalContext.preferredPrimaryReason || "Official IETF sources identify this as an IETF Internet-Draft."} The organization should be IETF, not an author affiliation or the label "Independent".`,
        };
      } else if (normalizeText(qaResults.organization?.suggested) && normalizeText(qaResults.organization?.suggested) !== "ietf") {
        delete qaResults.organization;
      }
    }

    if (
      canonicalContext.preferredPrimaryUrl &&
      normalizeUrl(standard.link || "") !== normalizeUrl(canonicalContext.preferredPrimaryUrl) &&
      shouldOverrideWithCanonicalLink(
        qaResults.link?.suggested,
        canonicalContext.preferredPrimaryUrl
      )
    ) {
      qaResults.link = {
        suggested: canonicalContext.preferredPrimaryUrl,
        suggested_label: getDemotedLinkLabel(standard.link || ""),
        reason:
          canonicalContext.preferredPrimaryReason ||
          "A better canonical root specification URL was found.",
      };
    }

    return jsonResponse({
      success: true,
      data: {
        ...qaResults,
        citations,
        current: {
          organization: currentOrg,
          authors: currentAuthors,
          timeline_events: existingTimeline,
          description: standard.description,
          link: standard.link || "",
        },
      },
    });
  } catch (error) {
    console.error("QA error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
