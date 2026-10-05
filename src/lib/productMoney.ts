import type { Product } from '../features/products/types';
import type { Session, SessionProduct } from '../features/sessions/types';

// Product API amounts are millimes; frontend calculations use dinars.
export const toProductMillimes = (dinars: number): number => Math.round(dinars * 1000);

export function formatProductPrice(dinars: number): string {
  const [whole, fraction] = dinars.toFixed(3).split('.');
  return fraction === '000' ? `${whole}dt` : `${whole}dt.${fraction}`;
}

export const productInDinars = (product: Product): Product => ({
  ...product, price: product.price / 1000,
});

export const sessionProductInDinars = <T extends SessionProduct>(item: T): T => ({
  ...item,
  total_price: item.total_price / 1000,
  ...(item.products ? { products: productInDinars(item.products) } : {}),
});

export const sessionInDinars = (session: Session): Session => ({
  ...session,
  ...(session.session_products ? {
    session_products: session.session_products.map(sessionProductInDinars),
  } : {}),
});
