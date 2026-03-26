import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCartStore, useOrderStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Smartphone, Lock } from 'lucide-react';
import { toast } from 'sonner';

const CheckoutPage = () => {
  const { truckId = 'demo' } = useParams<{ truckId: string }>();
  const navigate = useNavigate();
  const { items, getSubtotal, getTax, getTotal, clearCart } = useCartStore();
  const { addOrder } = useOrderStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [customerName, setCustomerName] = useState('');

  if (items.length === 0) {
    navigate(`/menu/${truckId}`);
    return null;
  }

  const handlePayment = async () => {
    setIsProcessing(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const order = await Promise.race([
        addOrder({
          truckId,
          items: [...items],
          subtotal: getSubtotal(),
          tax: getTax(),
          total: getTotal(),
          status: 'received',
          customerName: customerName || undefined,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Order submit timed out')), 25_000)
        ),
      ]);

      clearCart();
      toast.success('Order placed successfully!');
      navigate(`/confirmation/${order.id}`);
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error(
        error instanceof Error && error.message.includes('timed out')
          ? 'Network timed out. Check your connection and try again.'
          : 'Failed to place order. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

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

        {/* Payment Methods */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <h2 className="font-semibold text-foreground">Payment Method</h2>
          
          <button className="w-full bg-foreground text-background rounded-xl p-4 flex items-center gap-3 hover:opacity-90 transition-opacity">
            <Smartphone className="w-6 h-6" />
            <span className="font-semibold">Apple Pay</span>
          </button>

          <button className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-green-500 rounded" />
            <span className="font-semibold text-foreground">Google Pay</span>
          </button>

          <button className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors">
            <CreditCard className="w-6 h-6 text-muted-foreground" />
            <span className="font-semibold text-foreground">Credit / Debit Card</span>
          </button>
        </motion.section>

        {/* Security Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <Lock className="w-3 h-3" />
          <span>Payments secured by PCI-compliant processing</span>
        </motion.div>
      </div>

      {/* Pay Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-bottom">
        <Button
          variant="cart"
          size="xl"
          className="w-full"
          onClick={handlePayment}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Processing...
            </div>
          ) : (
            `Pay ${getTotal().toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
};

export default CheckoutPage;
