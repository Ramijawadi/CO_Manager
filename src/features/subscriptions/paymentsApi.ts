import { apiRequest, jsonBody } from '../../lib/api';
import { toProductMillimes } from '../../lib/productMoney';

export interface PaymentInput {
  subscription_id: string;
  amount: number;
  payment_date: string;
  notes?: string;
}

export interface SubscriptionPayment extends Omit<PaymentInput, 'subscription_id'> {
  id: string;
  subscription_id: string | null;
  customer_name: string;
  plan_name: string;
  created_at: string;
  updated_at: string;
}

const inDinars = (payment: SubscriptionPayment): SubscriptionPayment => ({
  ...payment, amount: payment.amount / 1000,
});

export const getSubscriptionPayments = async (): Promise<SubscriptionPayment[]> =>
  (await apiRequest<SubscriptionPayment[]>('/subscription_payments')).map(inDinars);

export const createSubscriptionPayment = async (input: PaymentInput): Promise<SubscriptionPayment> =>
  inDinars(await apiRequest<SubscriptionPayment>('/subscription_payments', {
    method: 'POST', body: jsonBody({ ...input, amount: toProductMillimes(input.amount) }),
  }));

export const updateSubscriptionPayment = async (
  id: string, input: Partial<Omit<PaymentInput, 'subscription_id'>>,
): Promise<SubscriptionPayment> =>
  inDinars(await apiRequest<SubscriptionPayment>(`/subscription_payments/${id}`, {
    method: 'PATCH', body: jsonBody({
      ...input, ...(input.amount !== undefined ? { amount: toProductMillimes(input.amount) } : {}),
    }),
  }));

export const deleteSubscriptionPayment = (id: string): Promise<void> =>
  apiRequest(`/subscription_payments/${id}`, { method: 'DELETE' });
