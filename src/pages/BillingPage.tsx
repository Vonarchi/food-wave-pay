import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CreditCard, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';

const BillingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated!');
      window.history.replaceState({}, '', '/admin/billing');
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setSubscriptionStatus('inactive');
        setLoading(false);
        return;
      }

      try {
        const result = await Promise.race([
          supabase
            .from('profiles')
            .select('subscription_status')
            .eq('id', user.id)
            .single(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Billing profile request timed out')), 8000)
          ),
        ]);

        setSubscriptionStatus(result.data?.subscription_status || 'inactive');
      } catch (error) {
        console.warn('[billing] Failed to load subscription status:', error);
        setSubscriptionStatus('inactive');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleSubscribe = async () => {
    track('upgrade_clicked');
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again');
        return;
      }
      const returnUrl = window.location.origin;
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          returnUrl,
          successPath: '/admin?checkout=success',
          cancelPath: '/admin/billing',
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
        timeout: 30_000,
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error('Checkout not configured. Add STRIPE_PRICE_ID to Supabase secrets.');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background border-b border-border p-4">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Billing & Subscription</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-8 h-8 text-primary" />
            <h2 className="text-lg font-semibold">Subscription Status</h2>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading...
            </div>
          ) : subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{subscriptionStatus === 'trialing' ? 'Trialing' : 'Active'}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your ordering plan is {subscriptionStatus}. Digital menus stay published even if this plan ends. Card updates come from the Stripe receipt email.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Your digital menu and QR code stay free. Subscribe when you want the paid ordering plan. Status: {subscriptionStatus || 'inactive'}.
              </p>
              <Button
                variant="cart"
                size="lg"
                onClick={handleSubscribe}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Subscribe Now'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                If Subscribe does nothing, ensure STRIPE_PRICE_ID is set in Supabase Edge Function secrets.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
