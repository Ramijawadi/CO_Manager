export interface Room {
  id: string;
  room_number: string;
  name: string;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomRentalInput {
  room_id: string;
  tenant_name: string;
  phone?: string;
  entry_date: string;
  expected_departure_date: string;
  actual_departure_date?: string | null;
  notes?: string;
}

export interface RoomRental extends RoomRentalInput {
  id: string;
  phone: string;
  actual_departure_date: string | null;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type UtilityType = 'water' | 'electricity';
export type UtilityStatus = 'paid' | 'unpaid';

export interface UtilityPaymentInput {
  rental_id: string;
  type: UtilityType;
  billing_period: string;
  status: UtilityStatus;
  payment_date?: string | null;
  amount?: number | null;
  invoice_reference?: string;
  notes?: string;
}

export interface UtilityPayment extends Omit<UtilityPaymentInput, 'amount'> {
  id: string;
  amount: number | null;
  payment_date: string | null;
  invoice_reference: string;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
