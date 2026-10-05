import { apiRequest, jsonBody } from '../../lib/api';
import type { Session, SessionInput, SessionCheckoutInput } from './types';

export const getActiveSessions = (): Promise<Session[]> => apiRequest('/sessions?status=active');
export const addSessionProduct = async (session_id: string, product_id: string, quantity: number, total_price: number): Promise<void> => {
  await apiRequest('/session_products', {
    method: 'POST', body: jsonBody({ session_id, product_id, quantity, total_price }),
  });
};
export const removeSessionProduct = (id: string): Promise<void> =>
  apiRequest(`/session_products/${id}`, { method: 'DELETE' });
export const createSession = (session: SessionInput): Promise<Session> =>
  apiRequest('/sessions', { method: 'POST', body: jsonBody({ customer_id: session.customer_id }) });
export const checkoutSession = (id: string, updateData: SessionCheckoutInput): Promise<Session> =>
  apiRequest(`/sessions/${id}`, { method: 'PATCH', body: jsonBody(updateData) });
