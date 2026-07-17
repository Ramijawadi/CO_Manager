export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  created_at?: string;
  updated_at?: string;
}

export type ProductInput = Omit<Product, 'id' | 'created_at' | 'updated_at'>;
