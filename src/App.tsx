import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WelcomeModal } from "@/components/educational/WelcomeModal";
import Index from "./pages/Index";

const Watch = lazy(() => import("./pages/Watch"));
const Auth = lazy(() => import("./pages/Auth"));
const Creator = lazy(() => import("./pages/Creator"));
const Trending = lazy(() => import("./pages/Trending"));
const Profile = lazy(() => import("./pages/Profile"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Moderation = lazy(() => import("./pages/Moderation"));
const FlagDetail = lazy(() => import("./pages/FlagDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <WelcomeModal />
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/watch/:id" element={<Watch />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/creator" element={<Creator />} />
              <Route path="/trending" element={<Trending />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/moderation" element={<Moderation />} />
              <Route path="/moderation/flags/:flagId" element={<FlagDetail />} />
              <Route path="/moderation/users" element={<UserManagement />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
