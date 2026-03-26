import { create } from 'zustand';
import { CartItem, MenuItem, SelectedModifier, Order, OrderStatus } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface CartState {
  items: CartItem[];
  addItem: (menuItem: MenuItem, quantity: number, modifiers: SelectedModifier[], instructions?: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

interface OrderState {
  orders: Order[];
  currentOrder: Order | null;
  isLoading: boolean;
  fetchOrders: () => Promise<void>;
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  setCurrentOrder: (order: Order | null) => void;
  getActiveOrders: () => Order[];
  setOrders: (orders: Order[]) => void;
}

const TAX_RATE = 0.0825; // 8.25% tax

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (menuItem, quantity, modifiers, instructions) => {
    const id = `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: CartItem = {
      id,
      menuItem,
      quantity,
      selectedModifiers: modifiers,
      specialInstructions: instructions,
    };
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeItem: (cartItemId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== cartItemId),
    }));
  },

  updateQuantity: (cartItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === cartItemId ? { ...item, quantity } : item
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  getSubtotal: () => {
    const items = get().items;
    return items.reduce((total, item) => {
      let itemTotal = item.menuItem.price;
      item.selectedModifiers.forEach((mod) => {
        mod.options.forEach((opt) => {
          itemTotal += opt.price;
        });
      });
      return total + itemTotal * item.quantity;
    }, 0);
  },

  getTax: () => get().getSubtotal() * TAX_RATE,

  getTotal: () => get().getSubtotal() + get().getTax(),

  getItemCount: () => get().items.reduce((count, item) => count + item.quantity, 0),
}));

// Helper to generate order number (timestamp-based for uniqueness)
const generateOrderNumber = (): string => {
  return Date.now().toString().slice(-8);
};

// Helper to map database row to Order type
const mapDbRowToOrder = (row: any): Order => ({
  id: row.id,
  orderNumber: parseInt(row.order_number, 10),
  truckId: row.truck_id,
  customerName: row.customer_name || undefined,
  items: row.items as CartItem[],
  subtotal: parseFloat(row.subtotal),
  tax: parseFloat(row.tax),
  total: parseFloat(row.total),
  status: row.status as OrderStatus,
  createdAt: new Date(row.created_at),
});

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  currentOrder: null,
  isLoading: false,

  fetchOrders: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error);
        return;
      }

      const orders = (data || []).map(mapDbRowToOrder);
      set({ orders });
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setOrders: (orders) => set({ orders }),

  addOrder: async (orderData) => {
    const orderNumber = generateOrderNumber();
    
    const { data, error } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        truck_id: orderData.truckId,
        customer_name: orderData.customerName || null,
        items: orderData.items as any,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        total: orderData.total,
        status: orderData.status,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating order:', error);
      throw error;
    }

    const newOrder = mapDbRowToOrder(data);
    set((state) => ({
      orders: [newOrder, ...state.orders],
      currentOrder: newOrder,
    }));
    
    return newOrder;
  },

  updateOrderStatus: async (orderId, status) => {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order status:', error);
      throw error;
    }

    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId ? { ...order, status } : order
      ),
      currentOrder:
        state.currentOrder?.id === orderId
          ? { ...state.currentOrder, status }
          : state.currentOrder,
    }));
  },

  setCurrentOrder: (order) => set({ currentOrder: order }),

  getActiveOrders: () => {
    return get().orders.filter(
      (order) => order.status !== 'completed'
    );
  },
}));
