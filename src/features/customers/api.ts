import { apiRequest, jsonBody } from '../../lib/api';
import type { Customer, CustomerInput } from './types';

export const getCustomers = (): Promise<Customer[]> => apiRequest('/customers');
export const createCustomer = (customer: CustomerInput): Promise<Customer> =>
  apiRequest('/customers', { method: 'POST', body: jsonBody(customer) });
export const updateCustomer = (id: string, customer: CustomerInput): Promise<Customer> =>
  apiRequest(`/customers/${id}`, { method: 'PATCH', body: jsonBody(customer) });
export const deleteCustomer = (id: string): Promise<void> =>
  apiRequest(`/customers/${id}`, { method: 'DELETE' });
