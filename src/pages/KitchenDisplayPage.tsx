import { useEffect, useRef } from 'react';
import { useOrderStore } from '@/store/useStore';
import { Order, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, ChefHat, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const KitchenDisplayPage = () => {
  const { orders, updateOrderStatus, getActiveOrders } = useOrderStore();
  const activeOrders = getActiveOrders();
  const prevOrderCountRef = useRef(activeOrders.length);

  // Play sound and show notification for new orders
  useEffect(() => {
    if (activeOrders.length > prevOrderCountRef.current) {
      // New order received
      toast.success('New order received!', {
        icon: <Bell className="w-5 h-5 text-primary" />,
      });
      // Play notification sound (would need actual audio file)
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(() => {});
      } catch {
        // Audio not available
      }
    }
    prevOrderCountRef.current = activeOrders.length;
  }, [activeOrders.length]);

  const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
    const flow: OrderStatus[] = ['received', 'in_progress', 'ready', 'completed'];
    const currentIndex = flow.indexOf(currentStatus);
    if (currentIndex < flow.length - 1) {
      return flow[currentIndex + 1];
    }
    return null;
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'received':
        return <Bell className="w-5 h-5" />;
      case 'in_progress':
        return <ChefHat className="w-5 h-5" />;
      case 'ready':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const handleStatusUpdate = (order: Order) => {
    const nextStatus = getNextStatus(order.status);
    if (nextStatus) {
      updateOrderStatus(order.id, nextStatus);
      toast.success(`Order #${order.orderNumber} marked as ${ORDER_STATUS_LABELS[nextStatus]}`);
    }
  };

  const ordersByStatus = {
    received: activeOrders.filter((o) => o.status === 'received'),
    in_progress: activeOrders.filter((o) => o.status === 'in_progress'),
    ready: activeOrders.filter((o) => o.status === 'ready'),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-foreground text-background p-4 sticky top-0 z-30">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <ChefHat className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Kitchen Display</h1>
              <p className="text-background/70 text-sm">
                {activeOrders.length} active order{activeOrders.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-primary rounded-full text-primary-foreground text-sm font-medium">
              Live
            </div>
          </div>
        </div>
      </header>

      {activeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <ChefHat className="w-24 h-24 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">No Active Orders</h2>
            <p className="text-muted-foreground">
              Orders will appear here when customers place them
            </p>
          </motion.div>
        </div>
      ) : (
        <div className="p-4 max-w-7xl mx-auto">
          {/* Order Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Received Column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                <h2 className="font-bold text-foreground">
                  New Orders ({ordersByStatus.received.length})
                </h2>
              </div>
              <AnimatePresence>
                {ordersByStatus.received.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={handleStatusUpdate}
                    getNextStatus={getNextStatus}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* In Progress Column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="w-3 h-3 rounded-full bg-warning" />
                <h2 className="font-bold text-foreground">
                  In Progress ({ordersByStatus.in_progress.length})
                </h2>
              </div>
              <AnimatePresence>
                {ordersByStatus.in_progress.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={handleStatusUpdate}
                    getNextStatus={getNextStatus}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Ready Column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="w-3 h-3 rounded-full bg-success" />
                <h2 className="font-bold text-foreground">
                  Ready ({ordersByStatus.ready.length})
                </h2>
              </div>
              <AnimatePresence>
                {ordersByStatus.ready.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={handleStatusUpdate}
                    getNextStatus={getNextStatus}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface OrderCardProps {
  order: Order;
  onStatusUpdate: (order: Order) => void;
  getNextStatus: (status: OrderStatus) => OrderStatus | null;
  getStatusIcon: (status: OrderStatus) => React.ReactNode;
}

const OrderCard = ({
  order,
  onStatusUpdate,
  getNextStatus,
  getStatusIcon,
}: OrderCardProps) => {
  const nextStatus = getNextStatus(order.status);
  const timeSinceOrder = Math.floor(
    (Date.now() - new Date(order.createdAt).getTime()) / 60000
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`bg-card rounded-xl border-2 overflow-hidden ${
        order.status === 'received'
          ? 'border-primary shadow-lg shadow-primary/20'
          : 'border-border'
      }`}
    >
      {/* Order Header */}
      <div className="bg-secondary/50 p-3 flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-foreground">#{order.orderNumber}</p>
          {order.customerName && (
            <p className="text-sm text-muted-foreground">{order.customerName}</p>
          )}
        </div>
        <div className="text-right">
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}
          >
            {getStatusIcon(order.status)}
            {ORDER_STATUS_LABELS[order.status]}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{timeSinceOrder}m ago</p>
        </div>
      </div>

      {/* Order Items */}
      <div className="p-3 space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex items-start gap-2">
              <span className="font-bold text-primary">{item.quantity}×</span>
              <div className="flex-1">
                <p className="font-medium text-foreground">{item.menuItem.name}</p>
                {item.selectedModifiers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {item.selectedModifiers
                      .flatMap((m) => m.options.map((o) => o.name))
                      .join(', ')}
                  </p>
                )}
                {item.specialInstructions && (
                  <p className="text-xs text-warning italic mt-0.5">
                    ⚠️ {item.specialInstructions}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Button */}
      {nextStatus && (
        <div className="p-3 pt-0">
          <Button
            variant={order.status === 'ready' ? 'success' : 'default'}
            size="lg"
            className="w-full"
            onClick={() => onStatusUpdate(order)}
          >
            {nextStatus === 'in_progress' && 'Start Preparing'}
            {nextStatus === 'ready' && 'Mark Ready'}
            {nextStatus === 'completed' && 'Complete Order'}
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default KitchenDisplayPage;
