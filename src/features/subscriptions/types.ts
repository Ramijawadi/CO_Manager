import type { Customer } from '../customers/types';
import type { Plan } from '../plans/api';

export interface Subscription {
  id: string;
  customer_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  customers?: Customer;
  plans?: Plan;
}

export interface SubscriptionInput {
  customer_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  status?: string;
}
