import { apiRequest, jsonBody } from '../../lib/api';
import type { Product, ProductInput } from './types';

export const getProducts = (): Promise<Product[]> => apiRequest('/products');
export const createProduct = (product: ProductInput): Promise<Product> =>
  apiRequest('/products', { method: 'POST', body: jsonBody(product) });
export const updateProduct = (id: string, product: Partial<ProductInput>): Promise<Product> =>
  apiRequest(`/products/${id}`, { method: 'PATCH', body: jsonBody(product) });
export const deleteProduct = (id: string): Promise<void> =>
  apiRequest(`/products/${id}`, { method: 'DELETE' });
