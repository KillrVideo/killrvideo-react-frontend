import { Suspense, lazy, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WelcomeModal } from "@/components/educational/WelcomeModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const Watch = lazy(() => import("./pages/Watch"));
const Creator = lazy(() => import("./pages/Creator"));
const Trending = lazy(() => import("./pages/Trending"));
const Profile = lazy(() => import("./pages/Profile"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Moderation = lazy(() => import("./pages/Moderation"));
const FlagDetail = lazy(() => import("./pages/FlagDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));

const queryClient = new QueryClient();

const RouteSpinner = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const LazyRoute = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={<RouteSpinner />}>
      {children}
    </Suspense>
  </ErrorBoundary>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <WelcomeModal />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/watch/:id" element={<LazyRoute><Watch /></LazyRoute>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/creator" element={<LazyRoute><Creator /></LazyRoute>} />
            <Route path="/trending" element={<LazyRoute><Trending /></LazyRoute>} />
            <Route path="/profile" element={<LazyRoute><Profile /></LazyRoute>} />
            <Route path="/search" element={<LazyRoute><SearchResults /></LazyRoute>} />
            <Route path="/moderation" element={<LazyRoute><Moderation /></LazyRoute>} />
            <Route path="/moderation/flags/:flagId" element={<LazyRoute><FlagDetail /></LazyRoute>} />
            <Route path="/moderation/users" element={<LazyRoute><UserManagement /></LazyRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
