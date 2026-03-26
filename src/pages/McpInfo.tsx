export default function McpInfo() {
  const mcpUrl = "https://mcp.prosecco.dev";

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: "14px",
        padding: "2rem",
        margin: 0,
        background: "var(--background)",
        color: "var(--foreground)",
        minHeight: "100vh",
      }}
    >
{`# Prosecco.dev — MCP Server

> Model Context Protocol (MCP) server for the AI Standards Directory.
> Connect your AI agent to browse, search, and explore AI interoperability standards.

## Endpoint

  ${mcpUrl}

## Transport

  Streamable HTTP (POST)

## Available Tools

  - list_standards        — Browse standards, filter by status or tag
  - get_standard          — Full details for a single standard (authors, resources, summaries)
  - search_standards      — Keyword search across titles, descriptions, acronyms
  - get_directory_overview — Stats, organizations, tags, and endpoint URLs
  - list_tags             — All topic tags with counts
  - search_authors        — Find contributors by name or company
  - list_contributors_by_company — Company-level contributor map
  - suggest_standard      — Submit a new standard for review (adds to Backlog)
  - report_issue           — Report an issue or duplicate for admin review

## Connection Example

  {
    "mcpServers": {
      "prosecco": {
        "transport": {
          "type": "streamable-http",
          "url": "${mcpUrl}"
        }
      }
    }
  }

## Related Endpoints

  - llms.txt:       https://prosecco.dev/llms.txt
  - llms-full.txt:  https://prosecco.dev/llms-full.txt
  - directory.json: https://prosecco.dev/directory.json

## Admin MCP Server (Authenticated)

  Endpoint:  https://admin.prosecco.dev
  Token:     https://admin.prosecco.dev/token
  Transport: Streamable HTTP (POST) with Bearer auth
  Auth:      OAuth 2.1 client_credentials

  Additional tools: create_standard, update_standard, delete_standard,
  enrich_standard, generate_summary, list_feedback, dismiss_feedback,
  delete_feedback, list_backlog

  To get a token:
    POST https://admin.prosecco.dev/token
    Content-Type: application/x-www-form-urlencoded
    grant_type=client_credentials&client_id=...&client_secret=...

## About

Prosecco.dev is a curated, open directory of AI agent interoperability
standards, protocols, and specifications. This MCP server provides
programmatic access for AI agents to explore the directory.
`}
    </pre>
  );
}
