

## Plan: GitHub Markdown Export on Daily Backup

### What We're Building
Extend the daily backup edge function to also commit a folder of per-standard Markdown files to a GitHub repo. Each file contains **all** available information: description, authors, contributors, resources, tags, organization, status, latest summary, what's new, and timeline events. The folder overwrites daily.

### Secrets Needed
- `GITHUB_TOKEN` — GitHub Personal Access Token with Contents write permission on the target repo
- `GITHUB_REPO` — e.g. `owner/repo-name`

Both are opt-in: if not set, the GitHub export is silently skipped and the existing backup still runs.

### File Naming
```
data/standards/{uuid}_{sanitized-title}_{acronym}.md
```
Title sanitized to lowercase alphanumeric + hyphens. Acronym omitted if absent.

### Markdown Content Per File

Each file includes full frontmatter and all sections:

```markdown
---
id: uuid
title: Model Context Protocol
acronym: MCP
status: Approved
organization: Anthropic
tags: [agents, tools]
link: https://spec.modelcontextprotocol.io
expired: false
created_at: 2026-01-15T...
updated_at: 2026-03-27T...
---

# Model Context Protocol (MCP)

**Status:** Approved | **Organization:** Anthropic

## Description
Full description text from the database.

## Authors
| Name | Company | Role |
|------|---------|------|
| Jane Doe | Anthropic | Editor |
| John Smith | Google | Contributor |

## Resources
| Type | Label | URL |
|------|-------|-----|
| primary-spec | Specification | https://... |
| github | GitHub Repo | https://... |
| discord | Community | https://... |

## Tags
agents, tools, llm

## Latest Summary
Full summary text from standard_summaries.

## What's New
What's new text from standard_summaries.

## Timeline
| Date | Type | Title | Description |
|------|------|-------|-------------|
| 2026-03-01 | release | v1.0 Released | ... |
| 2026-02-15 | draft | Draft Published | ... |
```

### How It Works

After the existing Supabase Storage backup completes:

1. Check `GITHUB_TOKEN` and `GITHUB_REPO` env vars — skip if absent
2. Fetch all standards (already loaded) and latest `standard_summaries` per standard
3. Generate one Markdown string per standard with all fields above
4. Use GitHub Git Trees API for an atomic commit:
   - Create blobs for each file
   - Build a tree under `data/standards/`
   - Create a commit pointing to that tree
   - Update `refs/heads/main`
5. Old files in `data/standards/` are replaced (tree replaces the folder entirely)

### Changes

**`supabase/functions/backup-database/index.ts`** — Add ~80 lines after the storage upload block:
- Fetch `standard_summaries` grouped by `standard_id`
- `generateMarkdown(standard, summary)` helper producing the full content above
- `sanitizeFilename(title, acronym)` helper
- GitHub API calls (get current SHA → create tree → create commit → update ref)
- Report GitHub export status in the response JSON

**No other files changed.** No database changes. No new edge functions.

### Technical Details

- Uses GitHub REST API v3 with `Authorization: Bearer ${GITHUB_TOKEN}`
- Tree API replaces entire `data/standards/` folder each run, so deleted standards are cleaned up automatically
- Summaries joined by latest `generated_at` per `standard_id`
- Authors/resources rendered as Markdown tables; tags as comma-separated list
- Errors in GitHub export don't fail the main backup — reported separately in response

