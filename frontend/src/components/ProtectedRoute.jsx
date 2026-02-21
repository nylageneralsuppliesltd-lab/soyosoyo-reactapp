// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wrapper to protect routes that require authentication
 * Redirects to /login if no session exists
 */
export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
