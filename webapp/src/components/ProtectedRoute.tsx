import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const ProtectedRoute = () => {
    const { isLoggedIn, isReady } = useAuth();
    const location = useLocation();
    
    // Wait for authentication state to be fully resolved from SpacetimeDB
    if (!isReady) {
        return null; // Or a loading spinner if preferred, but usually silent is fine
    }

    if (!isLoggedIn) {
        return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
