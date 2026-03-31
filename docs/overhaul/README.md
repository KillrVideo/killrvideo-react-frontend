# KillrVideo UI/UX Overhaul

## Vision

KillrVideo is a reference application that teaches developers about Apache Cassandra and DataStax Astra DB through a functional video-sharing platform. This overhaul transforms it from a standard demo app into a **world-class developer teaching tool** by adding a developer experience panel that visually maps every UI interaction to its underlying database operation.

The core insight: developers learn best when they can see the CQL query, table schema, and driver code **right next to the UI element** that triggered it — not buried in documentation or source code.

## Chosen Direction: Learning Split (Prototype 06)

**[View the prototype →](mockups/06-learning-split.html)**

After exploring 5 design directions, **Learning Split** was selected as the implementation target. It combines:

- **Split-pane layout** — consumer UI on the left, dev panel on the right, with a smooth toggle
- **Faithful app layout** — the consumer side reproduces the real KillrVideo UI (purple hero, video cards, comments, related videos) rather than an abstract mockup
- **"Dev Panel" toggle** — replaces the existing "Guided Tour" toggle in the header, same position and pattern
- **Natural navigation** — clicking video cards navigates to Watch view, Home nav link returns to Home

### Why This Direction

| Factor | Learning Split |
|--------|---------------|
| Learning effectiveness | High — side-by-side comparison is the best way to learn |
| Implementation feasibility | Medium — builds on existing layout, adds a right panel |
| Consumer UX preservation | Excellent — left side IS the current app |
| Dev content density | High — full panel with queries, schemas, language examples |
| Path to production | Clear — the "Guided Tour" toggle already exists to replace |

## Documentation

| File | Description |
|------|-------------|
| [design-principles.md](design-principles.md) | Core design principles driving every decision |
| [dev-panel-spec.md](dev-panel-spec.md) | Detailed specification for the developer experience panel |
| [component-inventory.md](component-inventory.md) | All new React components with props, behavior, and usage |
| [color-exploration.md](color-exploration.md) | Color palette analysis across all prototype directions |

## All Prototypes Explored

The exploration process produced 6 prototypes. **[Browse all →](mockups/index.html)**

| # | Prototype | Key Idea | Status |
|---|-----------|----------|--------|
| 1 | [Terminal Fusion](mockups/01-terminal-fusion.html) | Dark IDE aesthetic, persistent left sidebar | Explored |
| 2 | [Clean Canvas](mockups/02-clean-canvas.html) | Minimal white, inline expandable dev blocks | Explored |
| 3 | [Split Lens](mockups/03-split-lens.html) | 50/50 split — consumer left, dev right | Explored |
| 4 | [Floating Inspector](mockups/04-floating-inspector.html) | Draggable floating panel over consumer UI | Explored |
| 5 | [Narrative Scroll](mockups/05-narrative-scroll.html) | Editorial layout, dev bands between content | Explored |
| 6 | [Learning Split](mockups/06-learning-split.html) | Real app layout + split dev panel | **Selected** |

## How to View

1. Open `docs/overhaul/mockups/06-learning-split.html` in any browser (no build step needed)
2. Toggle the **Dev Panel** switch in the header to show/hide the right panel
3. Click any **video card** to navigate to the Watch view
4. Click **Home** in the nav to return
5. In the dev panel, try:
   - **CQL / DataAPI toggle** — switch between query representations
   - **Language tabs** — view driver code in Python, Java, Node.js, or Rust

## Key Concepts

- **Dev Panel** — The crown jewel feature. Shows CQL queries, DataAPI equivalents, table schemas, and driver code for every UI interaction.
- **Teal Language** — Teal (#0DB7C4) universally means "developer artifact."
- **Static Data** — All educational content is hardcoded in the frontend, not fetched from the API.
- **Dual Audience** — The "Dev Panel" toggle (replacing "Guided Tour") switches between consumer and developer experiences.

## Design System

**Colors:** Primary Orange `#E85B3A` · Dark Navy `#1A1A2E` · Warm Cream `#FBF8F4` · Dev Teal `#0DB7C4` · Gold `#FFCA0B` · KillrVideo Purple `#6B1C96` (hero gradient)

**Typography:** Playfair Display (KillrVideo branding) · Inter (everything else)

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · React Query
