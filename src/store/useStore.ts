import { create } from 'zustand';
import { CartItem, MenuItem, SelectedModifier, Order, OrderStatus } from '@/types';

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
  orderCounter: number;
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  setCurrentOrder: (order: Order | null) => void;
  getActiveOrders: () => Order[];
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

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  currentOrder: null,
  orderCounter: 100, // Start order numbers at 100

  addOrder: (orderData) => {
    const orderNumber = get().orderCounter;
    const newOrder: Order = {
      ...orderData,
      id: `order-${Date.now()}`,
      orderNumber,
      createdAt: new Date(),
    };
    set((state) => ({
      orders: [newOrder, ...state.orders],
      orderCounter: state.orderCounter + 1,
      currentOrder: newOrder,
    }));
    return newOrder;
  },

  updateOrderStatus: (orderId, status) => {
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
