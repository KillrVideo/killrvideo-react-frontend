# NOTICE - February 10, 2026

This repository was temporarily offline following the confirmation of unauthorized activity within a limited number of our public DataStax GitHub repositories, listed below. Working with our internal incident response team, we worked to contain, remediate and investigate the activity.

We followed established incident-response processes to review and to revert any unauthorized activity.

Required Actions: Collaborators who interacted with this repository between January 31, 2026, and February 9, 2026, rebase your branch onto the new main / master. **Do not merge main / master into your branch!**

Developers should review their environments for the following Indicators of Compromise in conjunction with downloading the impacted repositories:
- File SHA1 Hashes:
  - def338ee2fbc6f84b4a22ead67471824fe1a565f
  - 78be1ea752622c75fd5c636abc2e6e7a51484323
- File names:
  - .vscode/tasks.json
  - temp_auto_push.bat
- Domain names:
  - vscode-extension-260120.vercel[.]app
  - fullnode.mainnet.aptoslabs[.]com
  - api.trongrid[.]io
  - bsc-dataseed.binance[.]org
- IP addresses:
  - 23.27.20[.]143
  - 136.0.9[.]8
- The user agent for the git pushes was git/2.51.0.vfs.0.3-Windows

At DataStax, we remain committed to your security and to transparency within the open-source community.

Impacted Repositories:
 - github.com/KillrVideo/killrvideo-react-frontend
 - github.com/KillrVideo/kv-be-python-fastapi-dataapi-table
 - github.com/KillrVideo/kv-dataloader-csharp

# KillrVideo React Frontend

A modern video platform showcasing scalable application architectures, built with React 19, TypeScript, and Tailwind CSS.

## About KillrVideo

KillrVideo is a reference application that demonstrates best practices for building modern, scalable web applications. It features video sharing, user authentication, comments, and real-time interactions.

## Tech Stack

- **React 19** - Modern React with latest features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality UI components (Radix primitives)
- **React Query** - Server state management
- **React Router** - Client-side routing

## Getting Started

### Prerequisites

- Node.js (install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- npm

### Environment Variables

- `VITE_BACKEND_URL` - The base URL for the KillrVideo backend API.

By default, the backends run on the following URL/port combinations:
Java: https://localhost:8443
Python: http://localhost:8080
C#: https://localhost:7264

_Note: This variable makes it easier to deploy the frontend via Docker or Podman._

### Installation

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd killrvideo-react-frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:8080`.

## Development Commands

```bash
npm run dev       # Start dev server (proxies /api to https://localhost:8443)
npm run build     # Production build
npm run build:dev # Development build (unoptimized)
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Project Structure

- `src/pages/` - Route-level components
- `src/components/` - Reusable components organized by feature
- `src/components/ui/` - shadcn/ui primitives
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utilities and API client
- `src/types/` - TypeScript type definitions

## API Integration

The frontend connects to the KillrVideo backend API:

- **Base URL**: `/api/v1` (proxied to backend in development)
- **Authentication**: JWT tokens stored in localStorage
- **API Client**: Class-based client in `src/lib/api.ts`
- **OpenAPI Spec**: `docs/killrvideo_openapi.yaml`

## Contributing

Please see `CLAUDE.md` for detailed development guidelines and conventions.

## License

This project is provided as a reference application for educational purposes.
