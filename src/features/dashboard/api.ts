import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

export interface DashboardStats {
  totalVisitorsToday: number;
  activeSessions: number;
  revenueToday: number;
  activeSubscriptions: number;
  productSalesToday: number;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const today = dayjs().startOf('day').toISOString();
  const todayDate = dayjs().format('YYYY-MM-DD');

  const [
    visitorsRes,
    activeSessionsRes,
    activeSubscriptionsRes,
    sessionsTodayRes,
    productsSoldTodayRes,
  ] = await Promise.all([
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('entry_time', today),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('end_date', todayDate),
    supabase
      .from('sessions')
      .select('id, time_cost')
      .gte('entry_time', today)
      .eq('status', 'completed'),
    supabase
      .from('session_products')
      .select('total_price, quantity')
      .gte('created_at', today),
  ]);

  if (visitorsRes.error) console.error('Error fetching visitors:', visitorsRes.error);
  if (activeSessionsRes.error) console.error('Error fetching active sessions:', activeSessionsRes.error);
  if (activeSubscriptionsRes.error) console.error('Error fetching active subscriptions:', activeSubscriptionsRes.error);
  if (sessionsTodayRes.error) console.error('Error fetching sessions today:', sessionsTodayRes.error);
  if (productsSoldTodayRes.error) console.error('Error fetching products sold today:', productsSoldTodayRes.error);

  const timeRevenue =
    sessionsTodayRes.data?.reduce((acc, s) => acc + (typeof s.time_cost === 'number' ? s.time_cost : 0), 0) ?? 0;

  const productRevenue =
    productsSoldTodayRes.data?.reduce((acc, p) => acc + (typeof p.total_price === 'number' ? p.total_price : 0), 0) ?? 0;

  const productItemsSold =
    productsSoldTodayRes.data?.reduce((acc, p) => acc + (typeof p.quantity === 'number' ? p.quantity : 0), 0) ?? 0;

  return {
    totalVisitorsToday: visitorsRes.count ?? 0,
    activeSessions: activeSessionsRes.count ?? 0,
    revenueToday: timeRevenue + productRevenue,
    activeSubscriptions: activeSubscriptionsRes.count ?? 0,
    productSalesToday: productItemsSold,
  };
};

export interface RevenueChartPoint {
  name: string;
  revenue: number;
}

export interface VisitorChartPoint {
  time: string;
  visitors: number;
}

export interface ChartData {
  revenueData: RevenueChartPoint[];
  visitorData: VisitorChartPoint[];
}

/**
 * Fetch real aggregated chart data from the database.
 * - Revenue chart: last 7 days grouped by day
 * - Visitor chart: today's sessions grouped by hour
 */
export const getChartData = async (): Promise<ChartData> => {
  const now = dayjs();
  const sevenDaysAgo = now.subtract(6, 'day').startOf('day').toISOString();
  const todayStart = now.startOf('day').toISOString();

  // Fetch completed sessions from last 7 days for revenue chart
  const { data: recentSessions, error: err1 } = await supabase
    .from('sessions')
    .select('entry_time, time_cost')
    .gte('entry_time', sevenDaysAgo)
    .eq('status', 'completed');

  // Fetch session products from last 7 days for revenue chart
  const { data: recentProducts, error: err2 } = await supabase
    .from('session_products')
    .select('created_at, total_price')
    .gte('created_at', sevenDaysAgo);

  // Fetch today's sessions for visitor chart
  const { data: todaySessions, error: err3 } = await supabase
    .from('sessions')
    .select('entry_time')
    .gte('entry_time', todayStart);

  if (err1) console.error('Error fetching recent sessions:', err1);
  if (err2) console.error('Error fetching recent products:', err2);
  if (err3) console.error('Error fetching today sessions:', err3);

  // Build revenue data for last 7 days
  const revenueMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const day = now.subtract(i, 'day');
    revenueMap.set(day.format('ddd'), 0);
  }

  recentSessions?.forEach((s) => {
    const dayKey = dayjs(s.entry_time).format('ddd');
    if (revenueMap.has(dayKey)) {
      revenueMap.set(dayKey, revenueMap.get(dayKey)! + (typeof s.time_cost === 'number' ? s.time_cost : 0));
    }
  });

  recentProducts?.forEach((p) => {
    const dayKey = dayjs(p.created_at).format('ddd');
    if (revenueMap.has(dayKey)) {
      revenueMap.set(dayKey, revenueMap.get(dayKey)! + (p.total_price ?? 0));
    }
  });

  const revenueData: RevenueChartPoint[] = Array.from(revenueMap.entries()).map(([name, revenue]) => ({
    name,
    revenue,
  }));

  // Build visitor data for today by hour (8am - 10pm)
  const visitorMap = new Map<string, number>();
  for (let h = 8; h <= 22; h += 2) {
    visitorMap.set(`${String(h).padStart(2, '0')}:00`, 0);
  }

  todaySessions?.forEach((s) => {
    const roundedHour = `${String(Math.floor(dayjs(s.entry_time).hour() / 2) * 2).padStart(2, '0')}:00`;
    if (visitorMap.has(roundedHour)) {
      visitorMap.set(roundedHour, visitorMap.get(roundedHour)! + 1);
    }
  });

  const visitorData: VisitorChartPoint[] = Array.from(visitorMap.entries()).map(([time, visitors]) => ({
    time,
    visitors,
  }));

  return { revenueData, visitorData };
};

export interface TopProduct {
  product_id: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

/**
 * Fetch top selling products today.
 */
export const getTopProducts = async (): Promise<TopProduct[]> => {
  const today = dayjs().startOf('day').toISOString();

  const { data, error } = await supabase
    .from('session_products')
    .select('product_id, quantity, total_price, products!product_id(name)')
    .gte('created_at', today);

  if (error || !data) return [];

  // Aggregate by product
  const productMap = new Map<string, TopProduct>();

  data.forEach((row: any) => {
    const id = row.product_id;
    const existing = productMap.get(id);
    const productName = row.products?.name ?? 'Inconnu';

    if (existing) {
      existing.quantity_sold += row.quantity ?? 0;
      existing.revenue += row.total_price ?? 0;
    } else {
      productMap.set(id, {
        product_id: id,
        name: productName,
        quantity_sold: row.quantity ?? 0,
        revenue: row.total_price ?? 0,
      });
    }
  });

  return Array.from(productMap.values())
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .slice(0, 5);
};

export interface ActiveSessionRow {
  id: string;
  customer_name: string;
  entry_time: string;
  duration_minutes: number;
}

/**
 * Fetch active sessions for the dashboard mini-table.
 */
export const getActiveSessionsList = async (): Promise<ActiveSessionRow[]> => {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, entry_time, customers!customer_id(full_name)')
    .eq('status', 'active')
    .order('entry_time', { ascending: false })
    .limit(10);

  if (error || !data) return [];

  const now = dayjs();

  return data.map((s: any) => ({
    id: s.id,
    customer_name: s.customers?.full_name ?? 'Inconnu',
    entry_time: s.entry_time,
    duration_minutes: now.diff(dayjs(s.entry_time), 'minute'),
  }));
};
