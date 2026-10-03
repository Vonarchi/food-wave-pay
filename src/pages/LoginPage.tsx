import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { SupabaseEnvBanner } from '@/components/SupabaseEnvBanner';
import { ConnectivityErrorHint } from '@/components/ConnectivityErrorHint';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { hasScanDraft } from '@/lib/scanDraft';

const LoginPage = () => {
  const navigate = useNavigate();
  const { signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsSubmitting(true);
    console.info("[sign-in] form submit");
    try {
      const { error } = await signIn(email, password);
      console.info("[sign-in] submit finished", { hasError: Boolean(error) });
      if (!error) navigate('/admin/dashboard', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
          <SupabaseEnvBanner />
          <div className="text-center mb-8">
            <img
              src="/logo.png?v=3"
              alt="KioKitchen"
              className="h-32 w-auto mx-auto mb-4 object-contain"
              width={640}
              height={320}
            />
            <h1 className="text-2xl font-bold text-foreground">Restaurant Login</h1>
            <p className="text-muted-foreground mt-1">Sign in to manage your menu and orders</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                required
                autoComplete="off"
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
                {error && <ConnectivityErrorHint message={error} />}
              </div>
            )}

            <Button
              type="submit"
              variant="cart"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>
          <GoogleAuthButton redirectPath={hasScanDraft() ? '/onboarding' : '/admin/dashboard'} />

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate(hasScanDraft() ? '/signup?from=scan' : '/scan')}
              className="text-primary font-medium hover:underline"
            >
              {hasScanDraft() ? 'Create account' : 'Scan your menu'}
            </button>
          </p>
        </div>

        <Button
          variant="ghost"
          className="w-full mt-4 text-muted-foreground"
          onClick={() => navigate('/')}
        >
          Back to Home
        </Button>
      </motion.div>
    </div>
  );
};

export default LoginPage;
