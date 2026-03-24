# Prosecco.dev — AI Standards Directory

A curated, open directory of AI agent interoperability standards, protocols, and specifications. Track the protocols, specifications, and standards shaping the AI ecosystem — from emerging proposals to approved specifications.

**Live site**: [prosecco.dev](https://prosecco.dev)

---

## Features

### Public-Facing

- **Kanban Board** — Standards organized by maturity status: Backlog → Emerging → Draft → Approved. Searchable and filterable by tag.
- **Standard Detail Pages** — Full metadata per standard including description, authors/contributors, resource links, AI-generated discussion summaries, "What's New" sections, and timeline events.
- **Tech Radar** — Visual Recharts-based radar showing standards plotted by maturity and category.
- **Timeline** — Chronological view of standard activity, milestones, and events across the directory.
- **Affiliations** — Organization and author/contributor explorer with a Sankey diagram showing company-to-standard relationships.
- **Community Feedback** — Any visitor can flag a standard with corrections or suggestions; feedback is AI fact-checked before admin review.
- **Dark/Light Theme** — Full theme toggle using `next-themes` with CSS custom properties.

### Machine-Readable Endpoints

- **`/llms.txt`** — Lightweight plaintext index of all standards with status and organization.
- **`/llms-full.txt`** — Full directory dump including authors, resources, discussion summaries, and "what's new" sections.
- **`/directory.json`** — Structured JSON export of the complete directory.
- **MCP Server** — Model Context Protocol server at `https://mcp.prosecco.dev` for AI agents to browse, search, and explore the directory.

### Admin Panel (Authenticated)

- **Standard Management** — Create, edit, delete standards. Inline tag and author editing.
- **AI Ingestion** — Paste a URL and AI extracts standard metadata (title, acronym, description, organization, status, tags, authors, resources) from the page. Also enriches with GitHub contributors.
- **Discover Standards** — AI discovers AI/ML/agent standards from specified organizations, with automatic link verification via DuckDuckGo search fallback.
- **Deduplication** — AI-powered duplicate/alias/collision detection across the directory using graph-based relationship modeling.
- **Mailing List Summarization** — AI summarizes standard resources (mailing lists, GitHub repos, docs) into structured summaries with timeline events.
- **Feedback Review** — Review community-submitted flags with AI fact-check results and suggested field updates.
- **User Management** — Role-based access control (admin/user) with email-based admin invitations.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui (Radix primitives) |
| Routing | React Router v6 |
| Data Fetching | TanStack React Query |
| Charts | Recharts |
| Markdown | react-markdown + remark-gfm |
| Backend | Supabase (Postgres, Auth, Edge Functions) |
| MCP Server | Deno edge function (mcp-lite + Hono) proxied via Cloudflare Worker |
| AI Gateway | Lovable AI Gateway (OpenAI-compatible API) |

---

## AI Functions — Models & System Prompts

All AI features use the [OpenAI-compatible completions API](https://ai.gateway.lovable.dev/v1/chat/completions) with structured tool calling for reliable output extraction.

### `analyze-standard`

**Model**: `google/gemini-3-flash-preview`

Extracts structured metadata from a webpage URL. Fetches the page content (up to 30k chars), then uses tool calling to extract title, acronym, description, organization, status, tags, spec link, resources (with typed categories), and authors/contributors with company affiliations and roles.

Additionally enriches results by fetching GitHub contributors from any linked repos (via the GitHub API) and merging them with AI-extracted authors.

**System prompt summary**: "You are an AI standards analyst. Given webpage content about an AI standard, extract structured metadata including resources and authors with company affiliations."

### `fact-check-standard`

**Model**: `google/gemini-3-flash-preview`

Validates community-submitted feedback against the current standard data and its live specification page (fetched up to 20k chars). Returns a structured assessment with validity boolean, confidence level (high/medium/low), reasoning, and suggested field updates.

**System prompt summary**: "You are an AI standards fact-checker. Assess whether community feedback is valid, provide confidence level, suggest specific field updates, and explain reasoning."

### `discover-standards`

**Model**: `google/gemini-2.5-flash`

Given a list of organizations, discovers all AI/ML/agent-related standards they publish. Uses tool calling for structured output, then verifies every returned URL via HEAD/GET requests. Falls back to DuckDuckGo search with domain-scoped queries if URLs are dead, using a curated map of organization domains (IETF, W3C, OASIS, IEEE, NIST, etc.).

**System prompt summary**: "You are an expert on AI/ML/agent standards. Identify standards from specific organizations that are specifically about AI, ML, agents, or agentic systems. Do NOT include general-purpose standards."

### `summarize-mailing-list`

**Model**: `google/gemini-3-flash-preview`

Fetches content from a standard's linked resources (up to 5 resources, 15k chars each), combines them (up to 50k chars total), and generates a structured summary with three components: a 300–500 word markdown summary, a 100–200 word "What's New" section focusing on recent activity, and a chronological timeline of events (releases, drafts, decisions, meetings, deadlines, milestones).

Results are cached in the `standard_summaries` table with 24-hour TTL.

**System prompt summary**: "You analyze technology standard resources and produce structured intelligence. Extract chronological events — dates, version numbers, meeting notes, release announcements, specification drafts, and deadlines."

### `dedupe-standards`

**Model**: `google/gemini-2.5-flash`

Analyzes the full spec inventory for duplicates, aliases, and naming collisions. Models entries as a relationship graph with typed edges: `true_duplicate`, `alias`, `editor_copy`, `replaced_by`, `merged_into`, `acronym_collision`. Each relationship has a confidence level and reasoning.

**System prompt summary**: "You are a spec de-duplication analyst. Model entries as a graph with relationships. Acronym similarity alone is NEVER sufficient to mark as duplicate. Prefer canonical URLs (IETF datatracker, official spec sites)."

### `llms-txt`

**No AI model** — Pure data aggregation. Queries all standards and summaries from the database and renders them as plaintext (`/llms.txt`, `/llms-full.txt`) or JSON (`/directory.json`). The full version includes authors, resources, discussion summaries, and "what's new" sections.

---

## MCP Server

The MCP server exposes the directory to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io/) using Streamable HTTP transport.

**Production endpoint**: `https://mcp.prosecco.dev`

### Available Tools

| Tool | Description |
|------|-------------|
| `list_standards` | Browse standards, filter by status or tag, with configurable limit (max 200) |
| `get_standard` | Full details for a single standard including latest discussion summary |
| `search_standards` | Keyword search across titles, descriptions, acronyms, and organizations |
| `get_directory_overview` | Stats, organization list, tag list, and endpoint URLs |
| `list_tags` | All topic tags with usage counts |
| `search_authors` | Find contributors by name or company affiliation |
| `list_organizations` | Organizations with their standards and counts |
| `list_contributors_by_company` | Company-level contributor map showing people and standards per company |

### Connection Example

```json
{
  "mcpServers": {
    "prosecco": {
      "transport": {
        "type": "streamable-http",
        "url": "https://mcp.prosecco.dev"
      }
    }
  }
}
```

### Architecture

The MCP function runs as a Supabase Edge Function (Deno) using `mcp-lite` and `Hono`. A Cloudflare Worker at `mcp.prosecco.dev` reverse-proxies requests to the Supabase function URL, handling CORS headers and the `mcp-session-id` header for session management.

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `standards` | Core standards data — title, acronym, description, organization, status, tags, link, authors (JSONB), resources (JSONB), logo_url, is_expired |
| `standard_summaries` | AI-generated summaries with what's_new, timeline_events (JSONB), keyed by standard_id + source_url |
| `standard_flags` | Community feedback/flags with status tracking and admin notes |
| `tags` | Tag registry |
| `user_roles` | Role-based access control (admin/user enum) |

Row-Level Security (RLS) is enabled on all tables. Admin operations use a `has_role()` security definer function to prevent recursive RLS checks.

---

## Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:8080`.

### Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

### Supabase Setup

1. Create a [Supabase](https://supabase.com) project
2. Run the migrations in `supabase/migrations/` against your database (in order)
3. Copy your project URL and anon key into `.env`

### Edge Functions (Local)

```bash
npx supabase start          # local Supabase stack (requires Docker)
npx supabase functions serve # serves all edge functions locally
```

For AI-powered functions, you'll need to set a `LOVABLE_API_KEY` secret (or substitute your own OpenAI-compatible API endpoint by modifying the gateway URL in each function).

### Replacing the AI Gateway

All AI calls go through `https://ai.gateway.lovable.dev/v1/chat/completions` using the OpenAI chat completions format. To use a different provider:

1. Replace the gateway URL in each edge function with your provider's endpoint (e.g. `https://api.openai.com/v1/chat/completions`)
2. Replace `LOVABLE_API_KEY` with your provider's API key
3. Update model names to match your provider's catalog (e.g. `gpt-4o` instead of `google/gemini-3-flash-preview`)

The request/response format is standard OpenAI-compatible, so any provider supporting the chat completions API with tool calling will work.

### Cloudflare Worker (MCP Proxy)

The `deploy-cf-worker` edge function programmatically deploys the Cloudflare Worker. It requires three secrets:

- `CLOUDFLARE_API_TOKEN` — API token with Workers Scripts and DNS permissions
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `CLOUDFLARE_ZONE_ID` — Zone ID for the domain

---

## Edge Functions Reference

| Function | Purpose | AI Model |
|----------|---------|----------|
| `mcp` | MCP server for AI agents | None (data only) |
| `llms-txt` | Generates `/llms.txt`, `/llms-full.txt`, `/directory.json` | None (data only) |
| `analyze-standard` | Extract standard metadata from a URL | gemini-3-flash-preview |
| `fact-check-standard` | AI fact-check community feedback | gemini-3-flash-preview |
| `discover-standards` | Discover standards from organizations | gemini-2.5-flash |
| `summarize-mailing-list` | Summarize standard resources with timeline | gemini-3-flash-preview |
| `dedupe-standards` | Detect duplicate/alias entries | gemini-2.5-flash |
| `invite-admin` | Admin invitation flow | None |
| `deploy-cf-worker` | Deploy Cloudflare MCP proxy worker | None |

---

## License

MIT
