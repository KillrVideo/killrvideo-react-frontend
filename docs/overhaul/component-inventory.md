# Component Inventory — Dev Panel & UI Overhaul

This document catalogs every new React component required for the KillrVideo UI/UX overhaul, with a focus on the developer experience (DevPanel) subsystem. Components are implemented in React 19 + TypeScript + Tailwind CSS using shadcn/ui (Radix primitives). The path alias `@/` maps to `src/`.

---

## Directory Layout

```
src/
  components/
    dev/
      DevPanel.tsx
      DevModeToggle.tsx
      QueryDisplay.tsx
      CqlDataApiToggle.tsx
      SchemaBlock.tsx
      LanguageSwitcher.tsx
      QueryBadge.tsx
      EndpointBadge.tsx
      SourceFileLink.tsx
      LatencyDisplay.tsx
      QueryMetadataBar.tsx
  hooks/
    useDevPanel.tsx        ← DevPanelContext provider + consumer hook
```

---

## Shared Type Reference

These types are referenced throughout the component props below. They should be defined in `src/types/api.ts` (or a new `src/types/dev.ts` if preferred).

```ts
type QueryMode = 'cql' | 'dataapi';
type QueryType = 'read' | 'write' | 'delete';
type DevPanelVariant = 'sidebar' | 'inline' | 'floating' | 'split' | 'narrative';

interface LanguageExample {
  language: string;   // e.g. 'Python', 'Java', 'Node.js', 'Rust'
  code: string;       // source code snippet
}

interface DevPanelQuery {
  cql: string;                     // raw CQL query string
  dataapi: string;                 // equivalent DataAPI JSON/command
  type: QueryType;
  endpoint: { method: string; path: string };
  latencyMs: number;
  sourceFile: string;
  sourceLine?: number;
  languages?: LanguageExample[];
}

interface TableColumn {
  name: string;
  type: string;                    // e.g. 'uuid', 'text', 'timestamp'
  role: 'partition' | 'clustering' | 'regular';
  clusteringOrder?: 'ASC' | 'DESC';
}

interface TableSchema {
  keyspace: string;
  table: string;
  columns: TableColumn[];
}

interface DevPanelEntry {
  id: string;
  label?: string;
  query: DevPanelQuery;
  schema?: TableSchema;
}
```

---

## Components

### DevPanel

**Path:** `src/components/dev/DevPanel.tsx`

Container component that orchestrates all developer experience content for a single page or section. It selects the appropriate layout strategy based on `variant` and renders child components (`QueryDisplay`, `SchemaBlock`, `LanguageSwitcher`) from the provided entries.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | Yes | Controls whether the panel is expanded/visible |
| `onToggle` | `() => void` | Yes | Called when the user clicks the panel's own open/close affordance |
| `entries` | `DevPanelEntry[]` | Yes | One or more query + schema entries to display |
| `variant` | `DevPanelVariant` | Yes | Layout strategy: `'sidebar'`, `'inline'`, `'floating'`, `'split'`, or `'narrative'` |

**Behavior**

- `'sidebar'` — fixed-width right column alongside page content, collapsible.
- `'inline'` — rendered as a block directly below the UI section it annotates.
- `'floating'` — absolute/fixed overlay, draggable or anchored to a corner.
- `'split'` — page is divided equally; left half is the live UI, right half is the dev panel.
- `'narrative'` — content and dev annotations flow together vertically in a single column (suitable for tutorial/walkthrough pages).
- Reads `queryMode` and `activeLanguage` from `DevPanelContext` (see `useDevPanel`); does not duplicate that state locally.
- When `entries` has more than one item, renders a tab strip or accordion so the user can select which entry to inspect.

**Used by prototypes:** all five layout-variant prototype pages.

---

### DevModeToggle

**Path:** `src/components/dev/DevModeToggle.tsx`

Global toggle for showing or hiding all dev-panel content across the entire application. Rendered inside the site `Header`.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isDevMode` | `boolean` | Yes | Current visibility state of dev content |
| `onToggle` | `() => void` | Yes | Callback to flip the state |

**Behavior**

- Persists `isDevMode` to `localStorage` under the key `killrvideo_dev_mode_enabled`. This mirrors the pattern used by `STORAGE_KEYS.GUIDED_TOUR_ENABLED` in `src/lib/constants.ts`.
- Renders as a labeled switch (`<Switch>` from shadcn/ui) in variants where header space permits.
- Renders as a compact icon button (`</>` monogram) when in the `'narrative'` or `'floating'` variant context (Clean Canvas mode), where the header may be hidden.
- When `isDevMode` is false, all `DevPanel` instances render `null`.

**Used by prototypes:** all prototype pages; toggle appears in the shared `Header`.

---

### QueryDisplay

**Path:** `src/components/dev/QueryDisplay.tsx`

Syntax-highlighted code block that shows either the CQL query or the DataAPI equivalent for the current operation, with a one-click copy affordance.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `query` | `DevPanelQuery` | Yes | Query object containing both `cql` and `dataapi` strings |
| `mode` | `QueryMode` | Yes | Which representation to display (`'cql'` or `'dataapi'`) |
| `onCopy` | `() => void` | Yes | Called after the user triggers the copy action |

**Behavior**

- Renders a `<pre><code>` block styled with Tailwind (`font-mono`, dark background).
- Mode is controlled externally (passed from `DevPanel` which reads `DevPanelContext`); `QueryDisplay` is a pure display component.
- The copy button sits in the top-right corner of the code block; clicking it writes the active query string to the clipboard and invokes `onCopy` (caller may show a toast).
- A `CqlDataApiToggle` is rendered immediately above the code block so the mode can be changed inline without the parent needing to wire a separate toggle placement.
- Syntax coloring uses CSS classes; a lightweight tokenizer for CQL keywords and JSON is preferred over a full Prism/Shiki dependency.

**Used by prototypes:** all prototype pages that include `DevPanel`.

---

### CqlDataApiToggle

**Path:** `src/components/dev/CqlDataApiToggle.tsx`

Segmented control (pill toggle) that switches between CQL and DataAPI display modes.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `QueryMode` | Yes | Currently active mode |
| `onChange` | `(mode: QueryMode) => void` | Yes | Called when the user selects the other segment |

**Behavior**

- Two segments: "CQL" and "Data API".
- Active segment has a solid background (`bg-purple-700 text-white`); inactive is ghost-style.
- Built on the shadcn/ui `Toggle` primitive or a pair of `Button` components with `variant="ghost"` and `aria-pressed`.
- Does not manage state; `onChange` propagates selection up to `DevPanelContext` so all `QueryDisplay` instances on the page stay in sync.

**Used by prototypes:** rendered inside `QueryDisplay`.

---

### SchemaBlock

**Path:** `src/components/dev/SchemaBlock.tsx`

Visual representation of a Cassandra table schema — keyspace, table name, and column list with type and key-role badges.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `schema` | `TableSchema` | Yes | Schema definition to render |
| `highlightColumn` | `string` | No | Name of a column to visually highlight (relevant to the current query) |

**Behavior**

- Header row shows `keyspace.table_name` in monospace.
- Each column is one row: `column_name` | `type` | key badge.
  - Partition key — purple `[PK]` badge (`bg-purple-100 text-purple-800`).
  - Clustering key — teal `[CK ↓]` badge (arrow reflects `clusteringOrder`; `↑` for ASC, `↓` for DESC); `bg-teal-100 text-teal-800`.
  - Regular column — gray badge (`bg-gray-100 text-gray-600`), no label text, just the type.
- When `highlightColumn` matches a column name, that row receives a subtle highlight ring (`ring-1 ring-amber-400 bg-amber-50`).
- Uses the shadcn/ui `Badge` component for key badges.

**Used by prototypes:** sidebar, split, and narrative variant pages.

---

### LanguageSwitcher

**Path:** `src/components/dev/LanguageSwitcher.tsx`

Horizontal tab bar that lets the user pick a programming-language example. Renders the corresponding code snippet for the active language below the tabs.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `languages` | `LanguageExample[]` | Yes | Available language examples; expected values are `'Python'`, `'Java'`, `'Node.js'`, `'Rust'` |
| `activeLanguage` | `string` | Yes | Currently selected language label |
| `onChange` | `(lang: string) => void` | Yes | Called when a tab is selected |

**Behavior**

- Built on the shadcn/ui `Tabs` primitive.
- Active language preference is stored in `DevPanelContext` (`activeLanguage` / `setActiveLanguage`) and persisted to `localStorage` under `killrvideo_dev_active_language`. This means selecting "Python" on the Watch page will pre-select Python on the Home page.
- Code block for the active language uses the same `font-mono` styling as `QueryDisplay`.
- If `languages` is empty or undefined, renders nothing.

**Used by prototypes:** sidebar and split variant pages.

---

### QueryBadge

**Path:** `src/components/dev/QueryBadge.tsx`

Small colored pill indicating the category of the database operation associated with a query.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `type` | `QueryType` | Yes | Operation category: `'read'`, `'write'`, or `'delete'` |

**Behavior**

| `type` | Label | Colors |
|--------|-------|--------|
| `'read'` | READ | `bg-teal-100 text-teal-800` |
| `'write'` | WRITE | `bg-amber-100 text-amber-800` |
| `'delete'` | DELETE | `bg-red-100 text-red-800` |

- Built on the shadcn/ui `Badge` component.
- No interactive behavior; purely presentational.

**Used by prototypes:** rendered inside `QueryMetadataBar`.

---

### EndpointBadge

**Path:** `src/components/dev/EndpointBadge.tsx`

Inline badge showing the HTTP method and path for the REST API call that triggered the displayed query.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `method` | `string` | Yes | HTTP method string, e.g. `'GET'`, `'POST'`, `'DELETE'` |
| `path` | `string` | Yes | API path string, e.g. `'/api/v1/videos/:id'` |

**Behavior**

- Renders as `METHOD /path` in a monospace font.
- Method is colored by verb:
  - `GET` — teal (`text-teal-700`)
  - `POST` / `PUT` / `PATCH` — amber (`text-amber-700`)
  - `DELETE` — red (`text-red-700`)
  - Other — gray (`text-gray-600`)
- Path segment is rendered in a neutral color alongside the colored method.
- No interactive behavior.

**Used by prototypes:** rendered inside `QueryMetadataBar`.

---

### SourceFileLink

**Path:** `src/components/dev/SourceFileLink.tsx`

Displays the source file (and optional line number) responsible for the current query, as a clickable link to the GitHub repository.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `file` | `string` | Yes | Relative path within the repo, e.g. `'src/lib/api.ts'` |
| `line` | `number` | No | Line number to anchor to in the GitHub permalink |

**Behavior**

- Renders the file path in a monospace style, truncated from the left if long (`direction: rtl` trick or CSS `truncate`).
- When `line` is provided, appends `#L{line}` to the link and shows `:line` suffix in the label, e.g. `src/lib/api.ts:142`.
- `href` is constructed as `https://github.com/KillrVideo/killrvideo-react-frontend/blob/main/{file}#{L{line}}`.
- Opens in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Uses a small `ExternalLink` icon from lucide-react at 12px alongside the path text.

**Used by prototypes:** rendered inside `QueryMetadataBar`.

---

### LatencyDisplay

**Path:** `src/components/dev/LatencyDisplay.tsx`

Shows a representative query latency figure with color coding to communicate performance at a glance.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `ms` | `number` | Yes | Latency in milliseconds |

**Behavior**

- Renders `~{ms}ms` (tilde prefix signals this is a representative estimate, not a live measurement).
- Color coding:

| Condition | Color |
|-----------|-------|
| `ms < 10` | green — `text-green-600` |
| `ms < 50` | yellow — `text-yellow-600` |
| `ms >= 50` | red — `text-red-600` |

- No interactive behavior.

**Used by prototypes:** rendered inside `QueryMetadataBar`.

---

### QueryMetadataBar

**Path:** `src/components/dev/QueryMetadataBar.tsx`

Horizontal summary bar that composes `QueryBadge`, `EndpointBadge`, `LatencyDisplay`, and `SourceFileLink` into a single unified strip displayed at the top of a `DevPanel` entry.

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `query` | `DevPanelQuery` | Yes | Full query object; bar extracts the fields each child needs |

**Behavior**

- Renders children in a horizontal flex row with consistent gap and vertical alignment.
- Order (left to right): `QueryBadge` → `EndpointBadge` → `LatencyDisplay` → `SourceFileLink` (pushed to the right with `ml-auto`).
- Separated from the main query content below by a 1px border (`border-b border-gray-200`).
- This component is the single point of composition for query metadata; callers never assemble `QueryBadge` etc. directly.

**Used by prototypes:** all prototype pages that include `DevPanel`.

---

## DevPanelContext (Provider + Hook)

**Path:** `src/hooks/useDevPanel.tsx`

Global React context that holds all cross-cutting dev-panel state. Mirrors the pattern used by `useAuth.tsx` — a single file that exports both the `Provider` component and the `useDevPanel` consumer hook.

### Context Shape

| Value | Type | Description |
|-------|------|-------------|
| `isDevMode` | `boolean` | Whether dev content is globally visible |
| `toggleDevMode` | `() => void` | Flips `isDevMode` and persists to localStorage |
| `activeLanguage` | `string` | Currently selected language in `LanguageSwitcher` |
| `setActiveLanguage` | `(lang: string) => void` | Updates and persists language preference |
| `queryMode` | `QueryMode` | `'cql'` or `'dataapi'` |
| `setQueryMode` | `(mode: QueryMode) => void` | Updates query mode across all `QueryDisplay` instances |

### localStorage Keys

| Key | State value |
|-----|-------------|
| `killrvideo_dev_mode_enabled` | `isDevMode` |
| `killrvideo_dev_active_language` | `activeLanguage` |

These keys should be added to the `STORAGE_KEYS` constant object in `src/lib/constants.ts`.

### Behavior

- `DevPanelProvider` is mounted once inside `App.tsx`, wrapping the router (same level as `AuthProvider`).
- Initial state is read from `localStorage` on mount, defaulting to `isDevMode: false`, `activeLanguage: 'Python'`, `queryMode: 'cql'`.
- `useDevPanel()` throws if called outside `DevPanelProvider` (matches `useAuth` pattern).

**Used by:** `DevPanel`, `DevModeToggle`, `CqlDataApiToggle`, `LanguageSwitcher` (all read from context rather than receiving mode/language as props where they would otherwise need to be threaded through many layers).

---

## Component Dependency Graph

```
Header
  └── DevModeToggle          (reads/writes isDevMode via useDevPanel)

DevPanel
  ├── QueryMetadataBar
  │     ├── QueryBadge
  │     ├── EndpointBadge
  │     ├── LatencyDisplay
  │     └── SourceFileLink
  ├── QueryDisplay
  │     └── CqlDataApiToggle (writes queryMode to context)
  ├── SchemaBlock
  └── LanguageSwitcher       (reads/writes activeLanguage via context)
```

All state that must be shared across component boundaries lives in `DevPanelContext`. Components that only need local display data (e.g., `QueryBadge`, `LatencyDisplay`) accept plain props with no context dependency.
