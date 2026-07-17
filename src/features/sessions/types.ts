import type { Customer } from '../customers/types';

import type { Product } from '../products/types';

export interface SessionProduct {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  total_price: number;
  products?: Product;
}

export interface Session {
  id: string;
  customer_id: string;
  entry_time: string;
  exit_time: string | null;
  status: 'active' | 'completed';
  time_cost: number | null;
  created_at?: string;
  updated_at?: string;
  customers?: Customer; // For joined queries
  session_products?: SessionProduct[]; // Consumed products
}

export interface SessionInput {
  customer_id: string;
  entry_time?: string;
  status?: string;
}

export interface SessionCheckoutInput {
  exit_time: string;
  time_cost: number;
  status: 'completed';
}
