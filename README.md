# Prosecco.dev — AI Standards Directory

A curated, open directory of AI agent interoperability standards, protocols, and specifications.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **UI Components**: shadcn/ui (Radix primitives + Tailwind)
- **Routing**: React Router v6
- **Data Fetching**: TanStack React Query
- **Charts**: Recharts
- **Markdown**: react-markdown + remark-gfm
- **Backend**: Supabase (Postgres, Auth, Edge Functions)
- **MCP Server**: Streamable HTTP via Deno edge function + Cloudflare Worker proxy

## Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:8080`.

### Environment Variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

### Supabase Setup

1. Create a [Supabase](https://supabase.com) project
2. Run the migrations in `supabase/migrations/` against your database
3. Copy your project URL and anon key into `.env`

To deploy edge functions locally:

```bash
npx supabase start        # local Supabase stack (Docker required)
npx supabase functions serve
```

### Edge Functions

| Function | Purpose |
|---|---|
| `mcp` | MCP server — exposes standards data to AI agents |
| `llms-txt` | Generates `/llms.txt` and `/llms-full.txt` |
| `analyze-standard` | AI-powered standard analysis |
| `fact-check-standard` | AI fact-checking |
| `discover-standards` | AI discovery of new standards |
| `summarize-mailing-list` | Summarises mailing list archives |
| `dedupe-standards` | Detects duplicate entries |
| `invite-admin` | Admin invitation flow |
| `deploy-cf-worker` | Deploys Cloudflare MCP proxy worker |

### MCP Server

The MCP server is available at `https://mcp.prosecco.dev` (production) or via the local `mcp` edge function.

Connect from any MCP client:

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

### Machine-Readable Endpoints

- `https://prosecco.dev/llms.txt` — lightweight index
- `https://prosecco.dev/llms-full.txt` — full directory dump
- `https://prosecco.dev/directory.json` — JSON export

## License

MIT
