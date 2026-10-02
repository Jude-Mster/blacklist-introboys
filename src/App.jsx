import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import GuildLayout from '@/components/GuildLayout';
import Login from '@/pages/Login';
import Landing from '@/pages/Landing';
import AccountProblem from '@/pages/AccountProblem';
import Dashboard from '@/pages/Dashboard';
import Games from '@/pages/Games';
import Leaderboard from '@/pages/Leaderboard';
import Profile from '@/pages/Profile';
import Admin from '@/pages/Admin';
import Poker from '@/pages/Poker';
import Raffle from '@/pages/Raffle';
import Guide from '@/pages/Guide';
import { Privacy, Terms } from '@/pages/Legal';
// Add page imports here

// Old addresses (signup, password reset, the old Discord link page's callback)
// all lead to the one sign-in page, keeping any ?code&state Discord sent.
const ToLogin = () => {
  const loc = useLocation();
  return <Navigate to={"/login" + loc.search} replace />;
};

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<ToLogin />} />
      <Route path="/forgot-password" element={<ToLogin />} />
      <Route path="/reset-password" element={<ToLogin />} />
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<ToLogin />} />}>
        <Route element={<GuildLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/link-discord" element={<AccountProblem />} />
          <Route path="/games" element={<Games />} />
          <Route path="/poker" element={<Poker />} />
          <Route path="/poker/:tableId" element={<Poker />} />
          <Route path="/raffle" element={<Raffle />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App