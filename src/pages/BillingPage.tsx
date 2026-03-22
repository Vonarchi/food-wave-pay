import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CreditCard, ArrowLeft } from 'lucide-react';

/**
 * TODO: Connect Stripe for subscription management.
 * - Create Stripe Customer on restaurant signup
 * - Create Checkout Session for monthly plan
 * - Webhook to update subscription status
 * - Stripe Customer Portal for managing billing
 */
const BillingPage = () => {
  const navigate = useNavigate();

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
          <p className="text-muted-foreground text-sm mb-4">
            Stripe integration coming soon. You can use the app during the launch period.
          </p>
          <div className="p-4 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium text-foreground mb-2">To add Stripe:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create Stripe account and get API keys</li>
              <li>Add VITE_STRIPE_PUBLISHABLE_KEY to env</li>
              <li>Create a monthly product in Stripe Dashboard</li>
              <li>Implement checkout flow and webhook</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
