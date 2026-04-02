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
