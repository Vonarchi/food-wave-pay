import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** Protects restaurant admin routes. Redirects to login if not authenticated. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    console.info("[route-guard] ProtectedRoute", { loading, hasUser: Boolean(user) });
  }, [loading, user]);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = setTimeout(() => setLoadingTimedOut(true), 4000);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  if (loading) {
    if (loadingTimedOut) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">Still loading your session</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Auth bootstrap took longer than expected. Continue to login instead of waiting on a
              spinner forever.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button onClick={() => navigate('/login', { replace: true })}>
                Go to Login
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
