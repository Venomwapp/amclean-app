import '@/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminLogin from "./pages/AdminLogin";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Leads from "./pages/dashboard/Leads";
import Conversations from "./pages/dashboard/Conversations";
import Appointments from "./pages/dashboard/Appointments";
import Planning from "./pages/dashboard/Planning";
import Config from "./pages/dashboard/Config";
import Billing from "./pages/dashboard/Billing";
import Agents from "./pages/dashboard/Agents";
import AgentDetail from "./pages/dashboard/AgentDetail";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<AdminLogin />} />
    <Route path="/" element={<ProtectedRoute><DashboardLayout><Overview /></DashboardLayout></ProtectedRoute>} />
    <Route path="/leads" element={<ProtectedRoute><DashboardLayout><Leads /></DashboardLayout></ProtectedRoute>} />
    <Route path="/conversations" element={<ProtectedRoute><DashboardLayout><Conversations /></DashboardLayout></ProtectedRoute>} />
    <Route path="/appointments" element={<ProtectedRoute><DashboardLayout><Appointments /></DashboardLayout></ProtectedRoute>} />
    <Route path="/planning" element={<ProtectedRoute><DashboardLayout><Planning /></DashboardLayout></ProtectedRoute>} />
    <Route path="/billing" element={<ProtectedRoute><DashboardLayout><Billing /></DashboardLayout></ProtectedRoute>} />
    <Route path="/agents" element={<ProtectedRoute><DashboardLayout><Agents /></DashboardLayout></ProtectedRoute>} />
    <Route path="/agents/:agentName" element={<ProtectedRoute><DashboardLayout><AgentDetail /></DashboardLayout></ProtectedRoute>} />
    <Route path="/config" element={<ProtectedRoute><DashboardLayout><Config /></DashboardLayout></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
