# KillrVideo — Feature Building Guide

You are working on **KillrVideo**, an open-source reference application for Apache Cassandra and DataStax Astra DB. It models a video-sharing platform (think simplified YouTube) and is designed to teach developers how to build modern applications on top of Cassandra.

## Repositories

| Repo | Purpose | Stack |
|------|---------|-------|
| [killrvideo-react-frontend](https://github.com/KillrVideo/killrvideo-react-frontend) | Single-page web UI | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| [killrvideo-python](https://github.com/KillrVideo/killrvideo-python) | REST API backend | Python, FastAPI, Cassandra drivers |
| [killrvideo-data](https://github.com/KillrVideo/killrvideo-data) | Schema, seed data, and CQL scripts | CQL, Docker |
| **GitHub org** | [github.com/KillrVideo](https://github.com/KillrVideo) | |

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

- **Base URL:** `/api/v1` (proxied to the Python backend in development)
- **Auth:** JWT token from `/api/v1/users/login`, sent as `Authorization: Bearer <token>`
- **OpenAPI spec:** `docs/killrvideo_openapi.yaml`
- **API client:** `src/lib/api.ts` — class-based, every endpoint has a typed method
- **React Query hooks:** `src/hooks/useApi.ts` — one hook per query/mutation

## Database Layer

The backend uses **Apache Cassandra** (or **DataStax Astra DB** in the cloud). The developer panel in the frontend displays the actual CQL queries, Data API calls, and Table API calls for each page, so developers can see exactly how the database is used.

Three query modes are supported:
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

## Code Conventions

- **Path alias:** `@/` maps to `src/`
- **Components:** PascalCase filenames, functional components with hooks
- **API hooks:** `useXxx()` for queries, `useXxxMutation()` for mutations
- **Brand colors:** Primary purple `#6B1C96`, accent gold `#FFCA0B`
- **Commit format:** `<feat|fix|docs>: <summary> (refs #<id>)`

## How to Run

```bash
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:8080
npm run build     # Production build
npm run lint      # Run ESLint
```

> The backend must be running separately for API calls to work. See [killrvideo-python](https://github.com/KillrVideo/killrvideo-python) for setup.

---

What would you like to know more about?
