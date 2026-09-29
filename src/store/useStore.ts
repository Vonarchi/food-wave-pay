import { create } from 'zustand';
import { CartItem, MenuItem, SelectedModifier, Order, OrderStatus } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { createGuestOrderClient } from '@/lib/guestOrders';
import type { Json } from '@/integrations/supabase/types';
import { ORDER_TAX_RATE } from '@/lib/ordering/engine';

interface CartState {
  items: CartItem[];
  addItem: (menuItem: MenuItem, quantity: number, modifiers: SelectedModifier[], instructions?: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
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
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'> & { paymentStatus?: string; source?: string }) => Promise<Order & { guestAccessToken: string }>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  setCurrentOrder: (order: Order | null) => void;
  getActiveOrders: () => Order[];
  setOrders: (orders: Order[] | ((current: Order[]) => Order[])) => void;
}

const TAX_RATE = ORDER_TAX_RATE;

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

  setItems: (items) => set({ items }),

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
const mapDbRowToOrder = (row: {
  id: string;
  order_number: string;
  truck_id: string;
  customer_name: string | null;
  items: Json;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
  is_test?: boolean | null;
}): Order => ({
  id: row.id,
  orderNumber: parseInt(row.order_number, 10),
  truckId: row.truck_id,
  customerName: row.customer_name || undefined,
  items: row.items as unknown as CartItem[],
  subtotal: Number(row.subtotal),
  tax: Number(row.tax),
  total: Number(row.total),
  status: row.status as OrderStatus,
  createdAt: new Date(row.created_at),
  isTest: row.is_test === true,
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

  setOrders: (orders) =>
    set((state) => ({
      orders: typeof orders === 'function' ? orders(state.orders) : orders,
    })),

  addOrder: async (orderData) => {
    const orderNumber = generateOrderNumber();
    const guestAccessToken = crypto.randomUUID();
    const guest = createGuestOrderClient(guestAccessToken);

    const { data, error } = await guest
      .from('orders')
      .insert({
        order_number: orderNumber,
        truck_id: orderData.truckId,
        customer_name: orderData.customerName || null,
        items: orderData.items as unknown as Json,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        total: orderData.total,
        status: orderData.status || 'received',
        guest_access_token: guestAccessToken,
        ...(orderData.paymentStatus ? { payment_status: orderData.paymentStatus } : {}),
        ...(orderData.source ? { source: orderData.source } : {}),
        ...(orderData.isTest ? { is_test: true } : {}),
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

    return { ...newOrder, guestAccessToken };
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
