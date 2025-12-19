// Types for the food truck ordering system

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  available: boolean;
  modifiers?: ModifierGroup[];
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number;
  options: ModifierOption[];
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  specialInstructions?: string;
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  options: ModifierOption[];
}

export interface FoodTruck {
  id: string;
  name: string;
  description: string;
  logo?: string;
  coverImage?: string;
  categories: string[];
  menu: MenuItem[];
}

export interface Order {
  id: string;
  orderNumber: number;
  truckId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  createdAt: Date;
  customerName?: string;
}

export type OrderStatus = 'pending' | 'received' | 'in_progress' | 'ready' | 'completed';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  received: 'Received',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  received: 'bg-primary text-primary-foreground',
  in_progress: 'bg-warning text-warning-foreground',
  ready: 'bg-success text-success-foreground',
  completed: 'bg-secondary text-secondary-foreground',
};
