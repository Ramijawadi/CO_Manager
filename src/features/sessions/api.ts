import { apiRequest, jsonBody } from '../../lib/api';
import type { Session, SessionInput, SessionCheckoutInput } from './types';
import { sessionInDinars, toProductMillimes } from '../../lib/productMoney';

export const getActiveSessions = async (): Promise<Session[]> =>
  (await apiRequest<Session[]>('/sessions?status=active')).map(sessionInDinars);
export const addSessionProduct = async (session_id: string, product_id: string, quantity: number, total_price: number): Promise<void> => {
  await apiRequest('/session_products', {
    method: 'POST', body: jsonBody({ session_id, product_id, quantity, total_price: toProductMillimes(total_price) }),
  });
};
export const removeSessionProduct = (id: string): Promise<void> =>
  apiRequest(`/session_products/${id}`, { method: 'DELETE' });
export const createSession = async (session: SessionInput): Promise<Session> =>
  sessionInDinars(await apiRequest<Session>('/sessions', { method: 'POST', body: jsonBody({ customer_id: session.customer_id }) }));
export const checkoutSession = async (id: string, updateData: SessionCheckoutInput): Promise<Session> =>
  sessionInDinars(await apiRequest<Session>(`/sessions/${id}`, { method: 'PATCH', body: jsonBody(updateData) }));
