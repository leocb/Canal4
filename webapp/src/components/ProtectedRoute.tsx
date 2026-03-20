import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const ProtectedRoute = () => {
    const { isLoggedIn, isReady } = useAuth();
    
    // Wait for authentication state to be fully resolved from SpacetimeDB
    if (!isReady) {
        return null; // Or a loading spinner if preferred, but usually silent is fine
    }

    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
