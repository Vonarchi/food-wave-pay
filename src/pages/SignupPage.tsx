import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { SupabaseEnvBanner } from '@/components/SupabaseEnvBanner';
import { ConnectivityErrorHint } from '@/components/ConnectivityErrorHint';
import { track } from '@/lib/analytics';
import { readCampaign } from '@/lib/commerce';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { hasScanDraft, loadScanDraft } from '@/lib/scanDraft';
import { supabase } from '@/integrations/supabase/client';

const SignupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fromScan = searchParams.get('from') === 'scan' || hasScanDraft();
  const scanCount = loadScanDraft()?.items.length ?? 0;

  useEffect(() => {
    track('signup_started');
    const campaign = readCampaign(window.location.search) ?? sessionStorage.getItem('kk-campaign');
    if (!campaign || !readCampaign(`?campaign=${campaign}`)) return;
    sessionStorage.setItem('kk-campaign', campaign);
    void supabase.from('campaign_visits').insert({ campaign, event_name: 'visit' }).then(({ error: visitError }) => {
      if (visitError) console.warn('[campaign]', visitError.message);
    });
  }, []);

  // Capture referral params from URL (future partner tracking)
  const referralCode = searchParams.get('ref') || searchParams.get('referral_code') || undefined;
  const referredBy = searchParams.get('referred_by') || undefined;
  const partnerId = searchParams.get('partner_id') || undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const { error, needsEmailConfirmation } = await signUp(email, password, {
        fullName: fullName || undefined,
        referralCode,
        referredBy,
        partnerId,
      });
      if (!error) {
        track('signup_completed');
        const campaign = sessionStorage.getItem('kk-campaign');
        if (campaign && readCampaign(`?campaign=${campaign}`)) {
          void supabase.from('campaign_visits').insert({ campaign, event_name: 'signup' });
        }
        if (needsEmailConfirmation) {
          setSuccessMessage('Check your email to confirm your account, then sign in to continue onboarding.');
          return;
        }
        navigate('/onboarding', { replace: true });
      }
    } finally {
      setIsSubmitting(false); // Always stop spinner
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
            <h1 className="text-2xl font-bold text-foreground">
              {fromScan ? 'Keep your menu' : 'Create Account'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {fromScan
                ? `Create an account to save ${scanCount > 0 ? `${scanCount} scanned items` : 'your scanned menu'} and finish setup.`
                : 'Start your restaurant ordering setup'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="off"
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
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
                placeholder="Min. 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
                {error && <ConnectivityErrorHint message={error} />}
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-lg bg-primary/10 text-sm text-foreground">
                {successMessage}
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
                  Creating account...
                </>
              ) : fromScan ? (
                'Create account & keep menu'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>
          <GoogleAuthButton
            redirectPath="/onboarding"
            label={fromScan ? 'Keep menu with Google' : 'Continue with Google'}
          />

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-primary font-medium hover:underline"
            >
              Sign in
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

export default SignupPage;
