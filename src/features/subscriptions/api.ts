import { apiRequest, jsonBody } from '../../lib/api';
import type { Subscription, SubscriptionInput } from './types';
import { isUuid } from '../../utils/uuid';

const validatePlanId = (planId: string): void => {
  if (!isUuid(planId)) {
    throw new Error('Invalid subscription plan. Reload the plans and select a saved database plan.');
  }
};

export const getSubscriptions = (): Promise<Subscription[]> => apiRequest('/subscriptions');
export const getActiveSubscription = async (customerId: string): Promise<Subscription | null> => {
  const query = new URLSearchParams({
    customer_id: customerId, status: 'active',
    active_on: new Date().toISOString().split('T')[0], limit: '1',
  });
  const subscriptions = await apiRequest<Subscription[]>(`/subscriptions?${query}`);
  return subscriptions[0] ?? null;
};
export const createSubscription = async (sub: SubscriptionInput): Promise<Subscription> => {
  validatePlanId(sub.plan_id);
  return apiRequest('/subscriptions', { method: 'POST', body: jsonBody({ ...sub, status: sub.status || 'active' }) });
};
export const updateSubscription = async (id: string, sub: Partial<SubscriptionInput>): Promise<Subscription> => {
  if (sub.plan_id !== undefined) validatePlanId(sub.plan_id);
  return apiRequest(`/subscriptions/${id}`, { method: 'PATCH', body: jsonBody(sub) });
};
export const deleteSubscription = (id: string): Promise<void> =>
  apiRequest(`/subscriptions/${id}`, { method: 'DELETE' });
