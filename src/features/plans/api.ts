import { apiRequest, jsonBody } from '../../lib/api';

export interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  created_at: string;
}

export const getPlans = (): Promise<Plan[]> => apiRequest('/plans');
export const updatePlan = async (id: string, updates: Partial<Omit<Plan, 'id' | 'created_at'>>): Promise<void> => {
  await apiRequest(`/plans/${id}`, { method: 'PATCH', body: jsonBody(updates) });
};
export const createPlan = async (plan: Omit<Plan, 'id' | 'created_at'>): Promise<void> => {
  await apiRequest('/plans', { method: 'POST', body: jsonBody(plan) });
};
export const deletePlan = (id: string): Promise<void> => apiRequest(`/plans/${id}`, { method: 'DELETE' });
