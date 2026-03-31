# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start dev server on http://localhost:8080 (proxies /api to https://localhost:8443)
npm run build     # Production build
npm run build:dev # Development build (unoptimized)
npm run lint      # ESLint
npm run preview   # Preview production build
```

**Note:** No test runner is currently configured. E2E testing with Playwright is planned but not implemented.

## Architecture Overview

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix primitives)

### Data Fetching & State

- **Server state:** React Query (`@tanstack/react-query`) via custom hooks in `src/hooks/useApi.ts`
- **Auth state:** Context API + localStorage (`src/hooks/useAuth.tsx`)
- **API client:** `src/lib/api.ts` - class-based client with JWT Bearer auth, all endpoints mapped
- **Cache strategies:** Defined in `src/lib/constants.ts` (SHORT/MEDIUM/LONG/VERY_LONG stale times)

### Key Directories

- `src/pages/` - Route-level components (Home, Watch, Creator, Auth, Profile, etc.)
- `src/components/` - Reusable components organized by feature (video/, comments/, home/, layout/)
- `src/components/ui/` - shadcn/ui primitives (don't edit manually; regenerate with shadcn CLI)
- `src/hooks/` - Custom hooks (`useApi.ts` has all React Query hooks, `useAuth.tsx` for auth context)
- `src/lib/` - Utilities (`api.ts` for API client, `utils.ts` for helpers)
- `src/types/` - TypeScript types (`api.ts` for domain models, `killrvideo-openapi-types.ts` generated from OpenAPI)

### Routing

Client-side routing via `react-router-dom` in `src/App.tsx`. Routes use lazy loading with `React.lazy()` and `<Suspense>`.

### API Integration

- Base URL: `/api/v1` (proxied to backend in dev)
- Auth: JWT stored in `localStorage['auth_token']`, sent as `Authorization: Bearer <token>`
- OpenAPI spec: `docs/killrvideo_openapi.yaml`

## Code Conventions

- Path alias: `@/` maps to `src/`
- Components: PascalCase filenames, functional components with hooks
- API hooks follow pattern: `useXxx()` for queries, `useXxxMutation()` or action verbs for mutations
- Brand colors: Primary purple `#6B1C96`, accent gold `#FFCA0B`

## GitHub Workflow (from .cursor/rules/github.mdc)

- Create GitHub issue before coding (≥10 lines): `gh issue create --label "ai-task"`
- Branch naming: `issue-<number>`
- Commit format: `<feat|fix|docs>: <summary> (refs #<id>)`
- Progress comments: `⏳` start, `🚧` WIP, `❗` blockers, `✅` done
- Close with: `gh issue close <id> --comment "✅ Done."`
