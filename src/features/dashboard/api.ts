import { apiRequest } from '../../lib/api';
import type { Session, SessionProduct } from '../sessions/types';
import dayjs from 'dayjs';
import { sessionInDinars, sessionProductInDinars } from '../../lib/productMoney';

interface DashboardData {
  sessions: Session[];
  session_products: (SessionProduct & { created_at: string })[];
  activeSubscriptions: number;
  activeSessions: number;
}

const getDashboardData = async (since: string): Promise<DashboardData> => {
  const data = await apiRequest<DashboardData>(`/dashboard/data?${new URLSearchParams({ since, active_on: dayjs().format('YYYY-MM-DD') })}`);
  return {
    ...data,
    sessions: data.sessions.map(sessionInDinars),
    session_products: data.session_products.map(sessionProductInDinars),
  };
};

export interface DashboardStats {
  totalVisitorsToday: number;
  activeSessions: number;
  revenueToday: number;
  activeSubscriptions: number;
  productSalesToday: number;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const data = await getDashboardData(dayjs().startOf('day').toISOString());
  const timeRevenue = data.sessions.filter(session => session.status === 'completed')
    .reduce((total, session) => total + (session.time_cost ?? 0), 0);
  return {
    totalVisitorsToday: data.sessions.length,
    activeSessions: data.activeSessions,
    revenueToday: timeRevenue + data.session_products.reduce((total, product) => total + product.total_price, 0),
    activeSubscriptions: data.activeSubscriptions,
    productSalesToday: data.session_products.reduce((total, product) => total + product.quantity, 0),
  };
};

export interface RevenueChartPoint { name: string; revenue: number }
export interface VisitorChartPoint { time: string; visitors: number }
export interface ChartData { revenueData: RevenueChartPoint[]; visitorData: VisitorChartPoint[] }

export const getChartData = async (): Promise<ChartData> => {
  const now = dayjs();
  const data = await getDashboardData(now.subtract(6, 'day').startOf('day').toISOString());
  const revenueMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) revenueMap.set(now.subtract(i, 'day').format('YYYY-MM-DD'), 0);
  const addRevenue = (timestamp: string, amount: number) => {
    const key = dayjs(timestamp).format('YYYY-MM-DD');
    if (revenueMap.has(key)) revenueMap.set(key, revenueMap.get(key)! + amount);
  };
  data.sessions.filter(session => session.status === 'completed')
    .forEach(session => addRevenue(session.entry_time, session.time_cost ?? 0));
  data.session_products.forEach(product => addRevenue(product.created_at, product.total_price));
  const visitorMap = new Map<string, number>();
  for (let hour = 8; hour <= 22; hour += 2) visitorMap.set(`${String(hour).padStart(2, '0')}:00`, 0);
  data.sessions.filter(session => dayjs(session.entry_time).isSame(now, 'day')).forEach(session => {
    const key = `${String(Math.floor(dayjs(session.entry_time).hour() / 2) * 2).padStart(2, '0')}:00`;
    if (visitorMap.has(key)) visitorMap.set(key, visitorMap.get(key)! + 1);
  });
  return {
    revenueData: [...revenueMap].map(([date, revenue]) => ({ name: dayjs(date).format('ddd'), revenue })),
    visitorData: [...visitorMap].map(([time, visitors]) => ({ time, visitors })),
  };
};

export interface TopProduct { product_id: string; name: string; quantity_sold: number; revenue: number }

export const getTopProducts = async (): Promise<TopProduct[]> => {
  const query = new URLSearchParams({ since: dayjs().startOf('day').toISOString() });
  const rows = (await apiRequest<SessionProduct[]>(`/session_products?${query}`)).map(sessionProductInDinars);
  const productMap = new Map<string, TopProduct>();
  for (const row of rows) {
    const item = productMap.get(row.product_id) ?? {
      product_id: row.product_id, name: row.products?.name ?? 'Inconnu', quantity_sold: 0, revenue: 0,
    };
    item.quantity_sold += row.quantity;
    item.revenue += row.total_price;
    productMap.set(row.product_id, item);
  }
  return [...productMap.values()].sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 5);
};

export interface ActiveSessionRow { id: string; customer_name: string; entry_time: string; duration_minutes: number }

export const getActiveSessionsList = async (): Promise<ActiveSessionRow[]> => {
  const sessions = await apiRequest<Session[]>('/sessions?status=active&limit=10');
  return sessions.map(session => ({
    id: session.id, customer_name: session.customers?.full_name ?? 'Inconnu',
    entry_time: session.entry_time, duration_minutes: dayjs().diff(dayjs(session.entry_time), 'minute'),
  }));
};
