

## Plan: Add Spec Authors & Company Affiliations to Standards

### What We're Building
Track the authors of each standard specification along with their company affiliations, and display this on the public standard detail page for transparency.

### Database Changes

**Add `authors` column to `standards` table** as a JSONB array:
```sql
ALTER TABLE public.standards
ADD COLUMN authors jsonb DEFAULT '[]'::jsonb;
```

Each author entry: `{ name: string, company: string, role?: string, url?: string }`

No new table needed — a JSONB array on `standards` keeps it simple and avoids joins.

### Edge Function Update: `analyze-standard`

Update the AI extraction prompt and tool schema to include an `authors` field:
- Prompt instructs the AI to identify spec authors/editors, their company affiliation, and optionally their role (e.g. "Editor", "Chair", "Contributor")
- Tool schema adds: `authors: { type: "array", items: { name, company, role?, url? } }`

This covers both new standard ingestion (via `AiIngestion`) and enrichment of existing standards (via "Enrich with AI").

### Frontend Changes

1. **`EnrichmentReviewDialog`** — Add `authors` as a reviewable field so admins can accept/reject AI-suggested authors during enrichment.

2. **`AdminEdit`** — Add an "Authors" section to the edit form:
   - List of author entries with name, company, role fields
   - Add/remove buttons similar to `ResourceLinksEditor`
   - Wire up enrichment acceptance for authors

3. **`AiIngestion`** — Include authors in the review dialog when creating new standards from URL analysis.

4. **`StandardDetail` (public page)** — Add an "Authors & Affiliations" section:
   - Show each author's name, their company, and optional role
   - Group or badge by company for visual transparency
   - Simple card/list layout below the description

5. **`handleSave` in AdminEdit** — Include `authors` in the insert/update payload.

### Files to Create/Modify
- **Migration**: Add `authors` JSONB column to `standards`
- **`supabase/functions/analyze-standard/index.ts`**: Add authors to prompt + tool schema
- **`src/components/AuthorsEditor.tsx`** (new): Editable author list for admin
- **`src/pages/AdminEdit.tsx`**: Add AuthorsEditor, wire enrichment
- **`src/components/EnrichmentReviewDialog.tsx`**: Support `authors` field
- **`src/components/AiIngestion.tsx`**: Pass authors through to save
- **`src/pages/StandardDetail.tsx`**: Display authors section

