import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Admin from "./pages/Admin.tsx";
import AdminEdit from "./pages/AdminEdit.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import AdminFeedbackPage from "./pages/AdminFeedbackPage.tsx";
import StandardDetail from "./pages/StandardDetail.tsx";
import Radar from "./pages/Radar.tsx";
import Affiliations from "./pages/Affiliations.tsx";
import TimelinePage from "./pages/Timeline.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/standard/:id" element={<StandardDetail />} />
              <Route path="/radar" element={<Radar />} />
              <Route path="/affiliations" element={<Affiliations />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/edit/:id" element={<AdminEdit />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
