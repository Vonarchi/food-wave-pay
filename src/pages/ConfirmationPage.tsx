import { useParams, useNavigate } from 'react-router-dom';
import { useOrderStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, ChefHat } from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/types';

const ConfirmationPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const order = useOrderStore((state) =>
    state.orders.find((o) => o.id === orderId)
  );

  if (!order) {
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
        className="bg-gradient-to-br from-success to-success/80 p-8 pt-16 text-center safe-top"
      >
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
