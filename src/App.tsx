import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import MenuPage from "./pages/MenuPage";
import CheckoutPage from "./pages/CheckoutPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import KitchenDisplayPage from "./pages/KitchenDisplayPage";
import AdminPage from "./pages/AdminPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import OwnerDashboardPage from "./pages/OwnerDashboardPage";
import OrderingSettingsPage from "./pages/OrderingSettingsPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import OnboardingPage from "./pages/OnboardingPage";
import BillingPage from "./pages/BillingPage";
import PhoneSettingsPage from "./pages/PhoneSettingsPage";
import DriveThruPage from "./pages/DriveThruPage";
import OrderingLabPage from "./pages/OrderingLabPage";
import PayLinkPage from "./pages/PayLinkPage";
import PaymentsPage from "./pages/PaymentsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import StaffPage from "./pages/StaffPage";
import PlatformAdminPage from "./pages/PlatformAdminPage";
import StartPage from "./pages/StartPage";
import ScanFirstPage from "./pages/ScanFirstPage";
import InsightsPage from "./pages/InsightsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <Routes>
          {/* Public routes — no auth required */}
          <Route path="/" element={<Index />} />
          <Route path="/start" element={<StartPage />} />
          <Route path="/scan" element={<ScanFirstPage />} />
          <Route path="/menu/:truckId" element={<MenuPage />} />
          <Route path="/order/:truckId" element={<MenuPage />} />
          <Route path="/checkout/:truckId" element={<CheckoutPage />} />
          <Route path="/confirmation/:orderId" element={<ConfirmationPage />} />
          <Route path="/pay/:orderId" element={<PayLinkPage />} />

          {/* Auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected restaurant routes */}
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
          <Route path="/kitchen" element={<ProtectedRoute><KitchenDisplayPage /></ProtectedRoute>} />
          <Route path="/dashboard/kitchen" element={<ProtectedRoute><KitchenDisplayPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><OwnerDashboardPage /></ProtectedRoute>} />
          <Route path="/admin/ordering" element={<ProtectedRoute><OrderingSettingsPage /></ProtectedRoute>} />
          <Route path="/admin/system" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/admin/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
          <Route path="/admin/phone" element={<ProtectedRoute><PhoneSettingsPage /></ProtectedRoute>} />
          <Route path="/admin/drive-thru" element={<ProtectedRoute><DriveThruPage /></ProtectedRoute>} />
          <Route path="/admin/ordering-lab" element={<ProtectedRoute><OrderingLabPage /></ProtectedRoute>} />
          <Route path="/admin/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
          <Route path="/admin/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/admin/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
          <Route path="/admin/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
          <Route path="/platform" element={<ProtectedRoute><PlatformAdminPage /></ProtectedRoute>} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
