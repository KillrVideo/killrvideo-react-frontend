# KillrVideo — Feature Building Guide

This guide gives you everything you need to understand, build, and contribute a feature to **KillrVideo**, an open-source reference application for Apache Cassandra and DataStax Astra DB. It models a video-sharing platform and is designed to teach developers how to build modern applications on top of Cassandra.

Use this guide to choose the right repo, understand the existing patterns, make focused changes, and open a clean pull request.

## Repositories

| Repo | Purpose | Stack |
|------|---------|-------|
| [killrvideo-react-frontend](https://github.com/KillrVideo/killrvideo-react-frontend) | Single-page web UI | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| [kv-be-python-fastapi-dataapi-table](https://github.com/KillrVideo/kv-be-python-fastapi-dataapi-table) | Python backend (Data API / Table API) | Python, FastAPI |
| [kv-be-csharp-dataapi-table](https://github.com/KillrVideo/kv-be-csharp-dataapi-table) | C# backend (Data API / Table API) | C#, .NET |
| [kv-be-csharp-dotnet-driver-cql](https://github.com/KillrVideo/kv-be-csharp-dotnet-driver-cql) | C# backend (CQL driver) | C#, .NET |
| [kv-be-java-springboot3-dataapi-collections](https://github.com/KillrVideo/kv-be-java-springboot3-dataapi-collections) | Java backend (Data API collections) | Java, Spring Boot 3 |
| [killrvideo-data](https://github.com/KillrVideo/killrvideo-data) | Schema, seed data, and CQL scripts | CQL, Docker |
| [kv-dataloader-csharp](https://github.com/KillrVideo/kv-dataloader-csharp) | Data loader | C# |
| [killrvideo-dataapi-loader](https://github.com/KillrVideo/killrvideo-dataapi-loader) | Data loader (Data API) | Java |
| [killrvideo-csv-to-opensearch](https://github.com/KillrVideo/killrvideo-csv-to-opensearch) | CSV loader for OpenSearch | — |
| [killrvideo.github.io](https://github.com/KillrVideo/killrvideo.github.io) | Project docs site | GitHub Pages |
| **GitHub org** | [github.com/KillrVideo](https://github.com/KillrVideo) | |

## How to Choose the Right Repo

| If your change involves... | Work in |
|---|---|
| UI components, pages, routing, or styling | `killrvideo-react-frontend` |
| API endpoints, business logic, or database queries | One of the `kv-be-*` backend repos (pick the language/driver you're targeting) |
| Table schema, indexes, or seed data | `killrvideo-data` |
| Data loading or indexing pipelines | `kv-dataloader-csharp`, `killrvideo-dataapi-loader`, or `killrvideo-csv-to-opensearch` |
| Project documentation site | `killrvideo.github.io` |

Most features touch both the frontend and a backend. Start with the backend (API + schema) and then wire it into the frontend.

## The Developer Panel

The developer panel in the frontend is a core part of KillrVideo's teaching value. It shows how every UI feature connects to specific API calls and Cassandra/Astra DB access patterns. When you toggle it open, you see:

- The **CQL query**, **Data API call**, or **Table API call** behind each feature on the current page
- The **API endpoint** and HTTP method involved
- The **Cassandra table schema** backing the query
- **Driver code examples** in multiple languages

This is not just a debugging aid — it is how the project teaches contributors and learners about the full stack. When you add or change a feature, make sure the developer panel data in `src/data/devPanelData.ts` stays accurate and continues to clearly show the connection between UI, API, and database.

## Tech Stack (Frontend)

- **Framework:** React 19 with TypeScript
- **Bundler:** Vite (dev server on port 8080, proxies `/api` to backend on port 8443)
- **Styling:** Tailwind CSS with custom KillrVideo theme tokens (`kv-purple`, `kv-navy`, `kv-teal`, `kv-orange`, `kv-gold`)
- **UI primitives:** shadcn/ui (Radix-based, in `src/components/ui/`)
- **Server state:** React Query (`@tanstack/react-query`) via custom hooks
- **Routing:** react-router-dom with lazy-loaded routes
- **Auth:** JWT Bearer tokens stored in localStorage, managed by AuthContext

## Key Directories

```
src/
  pages/          Route-level page components (Home, Watch, Creator, Auth, Profile, etc.)
  components/     Reusable UI organized by feature (video/, comments/, home/, layout/, dev/)
  components/ui/  shadcn/ui primitives (auto-generated — do not edit manually)
  hooks/          Custom hooks (useApi.ts for React Query hooks, useAuth.tsx for auth)
  lib/            Utilities (api.ts for API client, utils.ts for helpers, constants.ts)
  types/          TypeScript types (api.ts for domain models)
  data/           Static data (devPanelData.ts for developer panel content)
docs/
  killrvideo_openapi.yaml   OpenAPI spec for the backend API
```

## API Integration

- **Base URL:** `/api/v1` (proxied to the backend in development)
- **Auth:** JWT token from `/api/v1/users/login`, sent as `Authorization: Bearer <token>`
- **OpenAPI spec:** `docs/killrvideo_openapi.yaml`
- **API client:** `src/lib/api.ts` — class-based, every endpoint has a typed method
- **React Query hooks:** `src/hooks/useApi.ts` — one hook per query/mutation

## Database Layer

The backend uses **Apache Cassandra** (or **DataStax Astra DB** in the cloud). Three query modes are supported:

1. **CQL** — native Cassandra Query Language
2. **Data API** — document-style JSON API for Astra DB
3. **Table API** — table-oriented JSON API for Astra DB

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Home | Featured + latest videos |
| `/watch/:id` | Watch | Video player, comments, related videos, ratings |
| `/auth` | Auth | Login / register |
| `/creator` | Creator | Upload and manage your videos |
| `/trending` | Trending | Popular and trending videos |
| `/explore` | Explore | Browse all videos |
| `/profile` | Profile | User profile and activity |
| `/search?q=` | Search | Search results |
| `/moderation` | Moderation | Content moderation dashboard |
| `/moderation/flags/:flagId` | Flag Detail | Individual flag review |
| `/moderation/users` | User Management | User administration |

## Feature Development Rules

Before writing any code, inspect what already exists:

1. **Check the current page** — open the route in the browser and toggle the developer panel to see which queries, endpoints, and schemas are already wired up.
2. **Read the related components** — trace from the page in `src/pages/` into the components it renders.
3. **Read the hooks** — find the React Query hook in `src/hooks/useApi.ts` that fetches or mutates the data you care about.
4. **Read the API client** — check `src/lib/api.ts` for the endpoint method and its types.
5. **Check the OpenAPI spec** — `docs/killrvideo_openapi.yaml` is the contract. Do not invent endpoints or request/response fields that are not in the spec.

Follow these rules:

- **Prefer existing patterns.** If similar features already exist (e.g., another CRUD page, another React Query hook), follow the same structure instead of introducing new abstractions.
- **Do not invent API endpoints or schema fields.** If the feature requires a new endpoint or table column, that change must happen in the backend and data repos first.
- **Never edit `src/components/ui/` manually.** These are generated by the shadcn CLI. Regenerate with `npx shadcn@latest add <component>`.
- **Keep dev panel data accurate.** If you add a query or change an endpoint, update `src/data/devPanelData.ts` so the developer panel reflects the real behavior.

## Code Conventions

- **Path alias:** `@/` maps to `src/`
- **Components:** PascalCase filenames, functional components with hooks
- **API hooks:** `useXxx()` for queries, `useXxxMutation()` for mutations
- **Brand colors:** Primary purple `#6B1C96`, accent gold `#FFCA0B`
- **Commit format:** `<feat|fix|docs>: <summary> (refs #<id>)`

## Contribution Workflow

```bash
# 1. Fork and clone
gh repo fork KillrVideo/killrvideo-react-frontend --clone
cd killrvideo-react-frontend

# 2. Add upstream remote
git remote add upstream https://github.com/KillrVideo/killrvideo-react-frontend.git

# 3. Create a feature branch
git checkout -b issue-<number>

# 4. Install and run
npm install
npm run dev       # http://localhost:8080

# 5. Make small, focused changes
#    Follow the feature development rules above

# 6. Validate before pushing
npm run lint
npm run build

# 7. Push and open a PR
git push origin issue-<number>
gh pr create --title "feat: <summary> (refs #<id>)"
```

> The backend must be running separately for API calls to work. See [kv-be-python-fastapi-dataapi-table](https://github.com/KillrVideo/kv-be-python-fastapi-dataapi-table) for setup.

## Before Opening a Pull Request

- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] You tested the affected flow locally in the browser
- [ ] UI changes include a screenshot or short screen recording in the PR description
- [ ] If your change adds or modifies an API call, you noted which endpoint and method
- [ ] If your change requires schema or seed-data updates, you linked the corresponding PR in `killrvideo-data`
- [ ] Developer panel data in `src/data/devPanelData.ts` is updated if queries or endpoints changed
