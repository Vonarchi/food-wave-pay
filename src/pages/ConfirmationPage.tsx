import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrderStore } from '@/store/useStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, ChefHat, ArrowLeft, Loader2 } from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/types';
import { Order, CartItem, OrderStatus } from '@/types';

const mapDbRowToOrder = (row: {
  id: string;
  order_number: string;
  truck_id: string;
  customer_name: string | null;
  items: unknown;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
}): Order => ({
  id: row.id,
  orderNumber: parseInt(row.order_number, 10),
  truckId: row.truck_id,
  customerName: row.customer_name || undefined,
  items: row.items as CartItem[],
  subtotal: parseFloat(String(row.subtotal)),
  tax: parseFloat(String(row.tax)),
  total: parseFloat(String(row.total)),
  status: row.status as OrderStatus,
  createdAt: new Date(row.created_at),
});

const ConfirmationPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const orderFromStore = useOrderStore((state) =>
    state.orders.find((o) => o.id === orderId)
  );
  const [fetchedOrder, setFetchedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!orderFromStore);
  const [notFound, setNotFound] = useState(false);

  // Fetch order by ID when not in store (e.g. after refresh)
  useEffect(() => {
    let active = true;

    if (orderFromStore) {
      setFetchedOrder(null);
      setLoading(false);
      return;
    }
    if (!orderId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    const fetchOrder = async () => {
      try {
        const result = await Promise.race([
          supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Order lookup timed out')), 8000)
          ),
        ]);

        if (!active) return;

        if (result.error || !result.data) {
          setNotFound(true);
        } else {
          setFetchedOrder(mapDbRowToOrder(result.data as Parameters<typeof mapDbRowToOrder>[0]));
        }
      } catch (error) {
        console.warn('[confirmation] Failed to load order:', error);
        if (!active) return;
        setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchOrder();

    return () => {
      active = false;
    };
  }, [orderId, orderFromStore]);

  const order = orderFromStore ?? fetchedOrder;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Order not found</h1>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (order.status) {
      case 'received':
        return <CheckCircle className="w-16 h-16" />;
      case 'in_progress':
        return <ChefHat className="w-16 h-16" />;
      case 'ready':
        return <CheckCircle className="w-16 h-16" />;
      default:
        return <Clock className="w-16 h-16" />;
    }
  };

  const getStatusColor = () => {
    switch (order.status) {
      case 'received':
        return 'text-primary';
      case 'in_progress':
        return 'text-warning';
      case 'ready':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Success Header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-success to-success/80 p-8 pt-16 text-center safe-top relative"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="absolute top-16 left-4 text-success-foreground hover:bg-success-foreground/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 bg-success-foreground/20 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-12 h-12 text-success-foreground" />
        </motion.div>
        <h1 className="text-2xl font-bold text-success-foreground mb-2">
          Order Confirmed!
        </h1>
        <p className="text-success-foreground/80">
          Your order has been sent to the kitchen
        </p>
      </motion.div>

      {/* Order Number */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border-b border-border p-6 text-center -mt-4 mx-4 rounded-2xl shadow-lg"
      >
        <p className="text-muted-foreground text-sm mb-1">Your Order Number</p>
        <p className="text-5xl font-bold text-foreground tracking-wider">
          #{order.orderNumber}
        </p>
        {order.customerName && (
          <p className="text-muted-foreground mt-2">for {order.customerName}</p>
        )}
      </motion.div>

      {/* Order Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="p-6 text-center"
      >
        <div className={`${getStatusColor()} mb-2 flex justify-center`}>
          {getStatusIcon()}
        </div>
        <p className="text-lg font-semibold text-foreground">
          {ORDER_STATUS_LABELS[order.status]}
        </p>
        <p className="text-muted-foreground text-sm mt-1">
          {order.status === 'received' && "We've received your order"}
          {order.status === 'in_progress' && 'Your food is being prepared'}
          {order.status === 'ready' && 'Your order is ready for pickup!'}
        </p>
      </motion.div>

      {/* Order Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex-1 p-4"
      >
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground mb-4">Order Details</h2>
          <div className="space-y-3">
            {order.items.map((item) => {
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

          <div className="border-t border-border mt-4 pt-4">
            <div className="flex justify-between text-lg font-bold text-foreground">
              <span>Total Paid</span>
              <span>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* New Order Button */}
      <div className="p-4 safe-bottom">
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => navigate(`/menu/${order.truckId}`)}
        >
          Place Another Order
        </Button>
      </div>
    </div>
  );
};

export default ConfirmationPage;
