import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';

export default function ProtectedRoute() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.force_change_password && location.pathname !== '/notification-settings') {
    return <Navigate to="/notification-settings" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
