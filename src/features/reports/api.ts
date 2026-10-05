import { apiRequest, jsonBody } from '../../lib/api';
import type { Session } from '../sessions/types';

export interface DailyClosure {
  id: string;
  closure_date: string;
  total_visitors: number;
  total_revenue: number;
  product_sales: number;
  time_revenue: number;
  created_at?: string;
}

export const getDailyClosures = (): Promise<DailyClosure[]> => apiRequest('/daily_closures');
export const closeDay = async (date: string, metrics: Omit<DailyClosure, 'id' | 'created_at' | 'closure_date'>): Promise<void> => {
  await apiRequest('/daily_closures', { method: 'POST', body: jsonBody({ closure_date: date, ...metrics }) });
};
export const getReportData = (startDate: string, endDate: string): Promise<Session[]> =>
  apiRequest(`/sessions?${new URLSearchParams({ start: startDate, end: endDate })}`);
