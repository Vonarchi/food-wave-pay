import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCartStore, useOrderStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { placeOrderPlan } from '@/lib/commerce';
import { friendlySupabaseError } from '@/lib/restaurant';
import { supabase } from '@/integrations/supabase/client';

const CheckoutPage = () => {
  const { truckId = 'demo' } = useParams<{ truckId: string }>();
  const navigate = useNavigate();
  const { items, getSubtotal, getTax, getTotal, clearCart } = useCartStore();
  const { addOrder } = useOrderStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    if (items.length === 0) {
      navigate(`/menu/${truckId}`, { replace: true });
      return;
    }
    track('checkout_started', { restaurant_slug: truckId });
  }, [items.length, navigate, truckId]);

  const handlePlaceOrder = async () => {
    setIsProcessing(true);

    try {
      const settings = await supabase
        .from('food_trucks')
        .select('require_payment_before_kitchen, pay_at_pickup_enabled, card_payments_enabled, stripe_account_id, test_mode')
        .eq('slug', truckId)
        .maybeSingle();
      const row = settings.error ? null : settings.data;
      const plan = placeOrderPlan({
        requirePaymentBeforeKitchen: row?.require_payment_before_kitchen === true,
        payAtPickupAllowed: row?.pay_at_pickup_enabled !== false,
        cardPaymentsReady: Boolean(row?.card_payments_enabled && row?.stripe_account_id),
        testMode: row?.test_mode === true,
      });
      if (plan.action === 'blocked') {
        toast.error(plan.message);
        return;
      }
      const order = await Promise.race([
        addOrder({
          truckId,
          items: [...items],
          subtotal: getSubtotal(),
          tax: getTax(),
          total: getTotal(),
          status: plan.status,
          paymentStatus: plan.paymentStatus,
          source: 'qr',
          isTest: plan.action === 'send_to_kitchen' ? plan.test : false,
          customerName: customerName || undefined,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Order submit timed out')), 25_000)
        ),
      ]);

      if (plan.action === 'await_card') {
        const payment = await supabase.functions.invoke('commerce', {
          body: { op: 'food_checkout', slug: truckId, orderId: order.id, token: order.guestAccessToken, origin: window.location.origin },
        });
        const url = (payment.data as { url?: string; error?: string } | null)?.url;
        if (!url) {
          toast.error((payment.data as { error?: string } | null)?.error || 'Card payment could not start. The order is held.');
          return;
        }
        submitted.current = true;
        clearCart();
        window.location.assign(url);
        return;
      }
      submitted.current = true;
      clearCart();
      track('order_completed', { restaurant_slug: truckId });
      toast.success(plan.action === 'send_to_kitchen' && plan.test ? 'Test order sent to the kitchen' : 'Order sent to the kitchen');
      navigate(`/confirmation/${order.id}?t=${order.guestAccessToken}`);
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error(friendlySupabaseError(error, 'Could not send the order. Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-background border-b border-border z-30 safe-top">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/menu/${truckId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Checkout</h1>
        </div>
      </header>

      <div className="p-4 space-y-6 pb-32">
        {/* Order Summary */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <h2 className="font-semibold text-foreground mb-4">Order Summary</h2>
          <div className="space-y-3">
            {items.map((item) => {
              let itemPrice = item.menuItem.price;
              item.selectedModifiers.forEach((mod) => {
                mod.options.forEach((opt) => {
                  itemPrice += opt.price;
                });
              });

              return (
                <div key={item.id} className="flex justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {item.quantity}× {item.menuItem.name}
                    </p>
                    {item.selectedModifiers.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {item.selectedModifiers
                          .flatMap((m) => m.options.map((o) => o.name))
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <p className="font-medium text-foreground">
                    ${(itemPrice * item.quantity).toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border mt-4 pt-4 space-y-2">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>${getSubtotal().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax (8.25%)</span>
              <span>${getTax().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-foreground pt-2">
              <span>Total</span>
              <span>${getTotal().toFixed(2)}</span>
            </div>
          </div>
        </motion.section>

        {/* Customer Name (Optional) */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <h2 className="font-semibold text-foreground mb-3">Your Name (Optional)</h2>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="For order pickup"
            className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <h2 className="font-semibold text-foreground mb-2">Pickup</h2>
          <p className="text-sm text-muted-foreground">
            This sends your order to the kitchen. Card payment is not charged in the app yet — pay when you pick up unless the restaurant tells you otherwise.
          </p>
        </motion.section>
      </div>

      {/* Pay Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-bottom">
        <Button
          variant="cart"
          size="xl"
          className="w-full"
          onClick={handlePlaceOrder}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Sending order...
            </div>
          ) : (
            `Place order · $${getTotal().toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
};

export default CheckoutPage;
