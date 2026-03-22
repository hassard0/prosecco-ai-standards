
# Prosecco.dev — AI Standards Directory MVP

A clean, modern public directory of AI standards displayed as a Kanban board with three status columns: **Emerging**, **Draft**, and **Approved**. Named in honor of the late Vittorio Bertocci.

## Phase 1: Database & Data Setup (Lovable Cloud)

**Set up Supabase tables:**
- `standards` table: id (UUID), title, description, acronym, logo_url, link, status (enum: Emerging/Draft/Approved), tags (text[]), created_at, updated_at
- `tags` table: id, name (for future filtering)
- Enable RLS with public read access on standards

**Seed data** from the existing AIStandards Directory repo's `standards.json` — all imported as "Approved" status.

## Phase 2: Public Kanban Board (Home Page)

**Header:**
- "Prosecco.dev" branding with a subtle champagne/prosecco accent color
- Tagline: "Your guide to AI Standards" (or similar)
- Search bar + tag filter chips

**Kanban Board Layout:**
- Three columns: Emerging | Draft | Approved
- Each column shows a count badge
- Cards display: title, acronym badge, short description (truncated), tags as small chips, and a link icon to the official spec
- Cards are read-only for public visitors (no drag-and-drop in MVP)
- Clean card design with subtle shadows, hover effects

**Search & Filter:**
- Real-time text search across title, description, acronym
- Filter by tags (clickable chips above the board)
- Filter by status (toggle columns on/off)

**Card Detail Modal:**
- Click a card to see full description, all metadata, and a prominent "View Specification" link button

## Phase 3: Responsive Design & Polish

- Mobile: columns stack vertically or become swipeable tabs
- Clean typography (Inter or similar), muted color palette with one accent color (prosecco gold: warm amber)
- Smooth transitions and loading states
- Footer with project attribution and tribute to Vittorio Bertocci

## Design System
- **Primary accent**: Warm prosecco gold/amber (`hsl(38, 80%, 55%)`)
- **Background**: Off-white (`hsl(40, 20%, 98%)`)
- **Cards**: White with subtle border and shadow
- **Typography**: Clean sans-serif, clear hierarchy
- **Style**: Minimal, Linear/Notion-inspired SaaS aesthetic
