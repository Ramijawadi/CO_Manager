import { apiRequest, jsonBody } from '../../lib/api';
import { toProductMillimes } from '../../lib/productMoney';
import type { Room, RoomRental, RoomRentalInput, UtilityPayment, UtilityPaymentInput } from './types';

const inDinars = (payment: UtilityPayment): UtilityPayment => ({
  ...payment, amount: payment.amount === null ? null : payment.amount / 1000,
});

export const getRooms = (): Promise<Room[]> => apiRequest('/rooms');
export const getRoomRentals = (): Promise<RoomRental[]> => apiRequest('/room_rentals');
export const getUtilityPayments = async (): Promise<UtilityPayment[]> =>
  (await apiRequest<UtilityPayment[]>('/utility_payments')).map(inDinars);

export const createRoom = (data: Pick<Room, 'room_number' | 'name' | 'notes'>): Promise<Room> =>
  apiRequest('/rooms', { method: 'POST', body: jsonBody(data) });
export const updateRoom = (id: string, data: Partial<Pick<Room, 'room_number' | 'name' | 'notes'>>): Promise<Room> =>
  apiRequest(`/rooms/${id}`, { method: 'PATCH', body: jsonBody(data) });
export const archiveRoom = (id: string): Promise<void> =>
  apiRequest(`/rooms/${id}`, { method: 'DELETE' });

export const createRental = (data: RoomRentalInput): Promise<RoomRental> =>
  apiRequest('/room_rentals', { method: 'POST', body: jsonBody(data) });
export const updateRental = (id: string, data: Partial<RoomRentalInput>): Promise<RoomRental> =>
  apiRequest(`/room_rentals/${id}`, { method: 'PATCH', body: jsonBody(data) });
export const archiveRental = (id: string): Promise<void> =>
  apiRequest(`/room_rentals/${id}`, { method: 'DELETE' });

export const createUtilityPayment = async (data: UtilityPaymentInput): Promise<UtilityPayment> =>
  inDinars(await apiRequest<UtilityPayment>('/utility_payments', {
    method: 'POST',
    body: jsonBody({ ...data, ...(data.amount !== null && data.amount !== undefined
      ? { amount: toProductMillimes(data.amount) } : {}) }),
  }));
export const updateUtilityPayment = async (id: string, data: Partial<Omit<UtilityPaymentInput, 'rental_id'>>): Promise<UtilityPayment> =>
  inDinars(await apiRequest<UtilityPayment>(`/utility_payments/${id}`, {
    method: 'PATCH',
    body: jsonBody({ ...data, ...(data.amount !== null && data.amount !== undefined
      ? { amount: toProductMillimes(data.amount) } : {}) }),
  }));
export const archiveUtilityPayment = (id: string): Promise<void> =>
  apiRequest(`/utility_payments/${id}`, { method: 'DELETE' });
