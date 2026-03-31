# KillrVideo UI/UX Overhaul — Design Principles

This document captures the core design principles guiding the KillrVideo UI/UX overhaul. These principles are not aspirational — they are constraints. Every component, layout decision, and color choice should be traceable back to at least one of them.

**Tech stack:** React 19 + TypeScript + Tailwind CSS + shadcn/ui
**Brand colors:** Primary orange `#E85B3A`, dark navy `#1A1A2E`, warm cream `#FBF8F4`, developer teal `#0DB7C4`, accent gold `#FFCA0B`
**Typography:** Playfair Display (headlines), Inter (body/UI)

---

## 1. Dev Panel as Crown Jewel

The developer experience panel is the differentiating feature of KillrVideo. Every other design decision exists in service of making CQL queries, DataAPI calls, schema layouts, and language-specific code examples immediately accessible to the user.

**Rationale:** KillrVideo is not a video platform that happens to show some code. It is a developer teaching tool that uses a video platform as its domain model. If the dev panel is buried, hard to find, or slow to load, the entire project fails at its primary purpose. Consumer-facing UI is scaffolding; the dev panel is the product.

**Implications:**
- The dev panel is always one click away, never more.
- Panel open/closed state persists across navigation so users are not interrupted mid-exploration.
- Panel content is pre-rendered and immediately readable — no loading states inside the panel itself.

---

## 2. Teal Language

Teal (`#0DB7C4`) is the universal signal for "developer artifact" across every component and prototype in this project. Wherever a user sees teal, they know the content is teaching material: a query, a schema, a code snippet, a badge, or a data model annotation.

**Rationale:** Visual literacy requires consistency. If teal sometimes means "query" and sometimes means "selected state" or "link hover," it loses its semantic value. By reserving teal exclusively for developer content, the color becomes a navigation aid. Users learn quickly that teal is always actionable educational content — no decoding required.

**Implications:**
- Teal is never used for purely decorative purposes.
- Teal is not used for primary navigation, form controls, or consumer-facing UI elements.
- The primary orange (`#E85B3A`) and gold (`#FFCA0B`) drive the consumer palette. Teal is the color that belongs to developers.

---

## 3. Dual-Audience Toggle

The UI serves two distinct audiences: consumers who want to browse and watch videos, and developers who want to understand the Cassandra data model and query patterns behind those actions. A single visible toggle switches between these contexts.

**Rationale:** Trying to serve both audiences simultaneously produces a cluttered UI that satisfies neither. A toggle makes the choice explicit. Consumer mode delivers a clean, distraction-free video experience. Developer mode layers educational content directly onto the same interface, showing exactly which backend operations power each user action.

**Implications:**
- Consumer mode: all dev panel content, teal badges, schema overlays, and query annotations are hidden.
- Developer mode: dev artifacts appear contextually alongside the UI elements they describe.
- The toggle state persists in localStorage so the user's preference survives page refreshes.
- Default state is developer mode — this is a developer demo application first.

---

## 4. CQL vs DataAPI Parity

Every query displayed in the dev panel has two equivalent representations: CQL (traditional Cassandra Query Language) and DataAPI (JSON/REST interface). Users choose their preferred interface, and both options are always available.

**Rationale:** Cassandra is accessible through multiple interfaces. Many developers new to Cassandra start with the DataAPI because it looks familiar. Showing CQL and DataAPI side by side teaches a critical insight: the same underlying data model and storage engine powers both. This demystifies CQL for REST-first developers and shows DataAPI users that they are not working with a black box.

**Implications:**
- The CQL/DataAPI toggle is a first-class UI element, not hidden in settings.
- Both representations must be kept in sync — if one is updated, the other must be updated in the same commit.
- The active interface selection (CQL or DataAPI) persists alongside the language selection.

---

## 5. Language Switcher

Code examples in the dev panel are available in Python, Java, Node.js, and Rust. Tab controls switch between language variants. The selected language persists globally — switching to Python on the Watch page means Python is active on every other dev panel instance until the user changes it.

**Rationale:** Developers have a primary working language. Making them re-select their language on every panel they open creates friction and breaks focus. Global persistence turns the language switcher from an annoyance into a preference setting that the app remembers. The four language choices cover the most common Cassandra SDK targets.

**Implications:**
- Language preference is stored in a React context (or localStorage) and consumed by all dev panel instances.
- Code examples for all four languages must be provided for every query. Placeholder or stub examples are not acceptable — they undermine trust.
- Language tab order: Python, Java, Node.js, Rust (most to least common in the Cassandra ecosystem).

---

## 6. Schema Blocks

The dev panel includes visual representations of Cassandra table schemas with color-coded badges distinguishing partition keys, clustering columns, and regular columns. Schema blocks show how data is physically organized in Cassandra, not just what columns exist.

**Rationale:** Understanding Cassandra requires understanding how data is stored and retrieved — not just the schema column names. A flat column list communicates nothing about partition strategy or sort order. Color-coded badges make partition keys, clustering columns, and regular columns visually distinct at a glance, turning the schema block into a teaching artifact rather than just documentation.

**Implications:**
- Partition key columns: orange badge (`#E85B3A`).
- Clustering columns: teal badge (`#0DB7C4`).
- Regular columns: neutral/muted badge.
- Schema blocks are not generated from live API introspection — they are statically defined alongside query examples (see Principle 8).

---

## 7. Query Badges

Each query displayed in the dev panel carries a compact badge row showing: operation type (READ / WRITE / DELETE), the HTTP endpoint it maps to, observed or estimated latency, and a link to the source file in the repository where that query is implemented.

**Rationale:** The goal is to connect UI actions to backend operations. A developer watching a video on KillrVideo should be able to see exactly which query ran, what type of operation it was, approximately how fast it was, and where in the codebase it lives. This closes the loop between "I clicked a button" and "here is what happened in the database."

**Implications:**
- Operation type badges use color: READ is teal (`#0DB7C4`), WRITE is orange (`#E85B3A`), DELETE is red.
- Source file links point to the actual backend repository path. These must be kept current when backend code moves.
- Latency values in the overhaul prototype are representative/illustrative — they are not live measurements. Label them clearly as "est." or "~Xms" to avoid implying real-time profiling.

---

## 8. Static Data Approach

Dev panel content — queries, schemas, code examples, badges — is statically defined and bundled with the frontend. It is not fetched from an API at runtime.

**Rationale:** Teaching content needs to be reliable, versioned, and independent of backend availability. If the dev panel content were API-driven, a backend outage or schema change would silently break the educational layer. Static content means the panel always loads instantly, works in offline/demo scenarios, and changes are tracked through the same code review process as any other source file. The dev panel is documentation that lives next to the code it describes.

**Implications:**
- Query examples, schema definitions, and code snippets live in typed TypeScript objects in the frontend source tree (e.g., `src/data/devPanel/`).
- When the backend API changes, the corresponding static content must be updated in the same PR.
- No loading spinners, skeleton states, or error boundaries are needed inside the dev panel itself.

---

## 9. AI-Friendly Architecture

Dev panel components are designed with clear, structured prop interfaces so AI tools can generate, validate, and modify content without parsing raw strings or reverse-engineering implicit structure.

**Rationale:** A significant portion of the content maintenance for this panel — adding new queries, updating code examples, adding language variants — will be assisted by AI tools. If schema data is stored as raw strings or inline JSX, AI assistance is unreliable. If it is stored as typed TypeScript objects with well-named fields, AI tools can generate new entries confidently and validators can catch structural errors before they reach users.

**Implications:**
- Schema definitions use typed interfaces (e.g., `CassandraSchema`, `QueryExample`, `CodeSnippet`) rather than ad-hoc prop shapes.
- Code examples are strings in a keyed record (`{ python: string; java: string; nodejs: string; rust: string }`), not JSX children.
- Component prop interfaces are documented with JSDoc comments explaining the purpose of non-obvious fields.

---

## 10. Progressive Disclosure

The dev panel does not display everything at once. The default view shows the query and operation badge. Schema details, language variants, and implementation notes are revealed on demand through expand controls.

**Rationale:** Information density is the enemy of comprehension. A developer seeing the panel for the first time should not be confronted with a wall of SQL, four language tabs, a schema grid, and a source link simultaneously. Starting with the query and type badge gives them a foothold. Each subsequent level of detail — schema, language examples, source link — is opt-in. Users who want depth can get it; users who just need a quick reference are not penalized.

**Implications:**
- Default collapsed state shows: operation badge, query text (CQL or DataAPI based on current toggle), latency estimate.
- First expand level reveals: schema block for the primary table involved.
- Second expand level reveals: full language tabs with copy-able code examples.
- Expand/collapse state for individual panels may be local (not persisted) — it resets on navigation, which is acceptable.
- Expand controls use clear affordances (chevron icons, "Show schema" labels) — never rely solely on whitespace or implicit hit targets.

---

## Summary Reference

| Principle | One-line summary |
|---|---|
| Dev Panel as Crown Jewel | The panel is the product; everything else is scaffolding |
| Teal Language | `#0DB7C4` means "developer artifact," always and only |
| Dual-Audience Toggle | One toggle switches between consumer and developer context |
| CQL vs DataAPI Parity | Every query has both representations; users choose |
| Language Switcher | Python / Java / Node.js / Rust; selection persists globally |
| Schema Blocks | Color-coded partition keys, clustering columns, regular columns |
| Query Badges | Type + endpoint + latency + source file link per query |
| Static Data Approach | Panel content is bundled, not fetched; always reliable |
| AI-Friendly Architecture | Typed interfaces make content generation and validation safe |
| Progressive Disclosure | Start with the query; expand to schema, code, and details |
