import { apiRequest, jsonBody } from '../../lib/api';
import type { Product, ProductInput } from './types';
import { productInDinars, toProductMillimes } from '../../lib/productMoney';

export const getProducts = async (): Promise<Product[]> =>
  (await apiRequest<Product[]>('/products')).map(productInDinars);
export const createProduct = async (product: ProductInput): Promise<Product> =>
  productInDinars(await apiRequest<Product>('/products', {
    method: 'POST', body: jsonBody({ ...product, price: toProductMillimes(product.price) }),
  }));
export const updateProduct = async (id: string, product: Partial<ProductInput>): Promise<Product> =>
  productInDinars(await apiRequest<Product>(`/products/${id}`, {
    method: 'PATCH', body: jsonBody({
      ...product, ...(product.price !== undefined ? { price: toProductMillimes(product.price) } : {}),
    }),
  }));
export const deleteProduct = (id: string): Promise<void> =>
  apiRequest(`/products/${id}`, { method: 'DELETE' });
