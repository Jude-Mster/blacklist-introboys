import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Only devices holding a guild session get past this point. Everyone else is
// shown `unauthenticatedElement` (a redirect to /login).
export default function ProtectedRoute({ unauthenticatedElement }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return unauthenticatedElement;
  return <Outlet />;
}