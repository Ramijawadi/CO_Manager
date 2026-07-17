export interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  notes: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'status'>;
