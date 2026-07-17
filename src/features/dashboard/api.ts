import { supabase } from '../../lib/supabase';

export interface DashboardStats {
  totalVisitorsToday: number;
  activeSessions: number;
  revenueToday: number;
  activeSubscriptions: number;
  productSalesToday: number;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // 1. Total visitors today
  const { count: totalVisitorsToday } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .gte('entry_time', todayStr);

  // 2. Active sessions
  const { count: activeSessions } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  // 3. Revenue today (session time cost + product sales)
  // Fetch completed sessions from today with explicit field selection
  const { data: sessionsToday, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, time_cost')
    .gte('entry_time', todayStr)
    .eq('status', 'completed');

  if (sessionsError) {
    console.error('Error fetching sessions for revenue:', sessionsError);
  }

  const timeRevenue = sessionsToday?.reduce((acc, curr) => {
    const cost = curr.time_cost ?? 0;
    return acc + (typeof cost === 'number' ? cost : 0);
  }, 0) || 0;

  // 4. Product Sales today
  const { data: productsSoldToday } = await supabase
    .from('session_products')
    .select('total_price, quantity')
    .gte('created_at', todayStr);

  const productRevenue = productsSoldToday?.reduce((acc, curr) => acc + (curr.total_price || 0), 0) || 0;
  const productItemsSold = productsSoldToday?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;

  // 5. Subscription users
  const { count: activeSubscriptions } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  return {
    totalVisitorsToday: totalVisitorsToday || 0,
    activeSessions: activeSessions || 0,
    revenueToday: timeRevenue + productRevenue,
    activeSubscriptions: activeSubscriptions || 0,
    productSalesToday: productItemsSold,
  };
};

// Mock data for charts if DB is empty
export const getChartData = async () => {
  // In a real app, you would aggregate data from Supabase grouped by date/hour.
  // We use mock aggregation here to show the charts as requested.
  const revenueData = [
    { name: 'Mon', revenue: 120 },
    { name: 'Tue', revenue: 150 },
    { name: 'Wed', revenue: 180 },
    { name: 'Thu', revenue: 90 },
    { name: 'Fri', revenue: 210 },
    { name: 'Sat', revenue: 250 },
    { name: 'Sun', revenue: 300 },
  ];

  const visitorData = [
    { time: '08:00', visitors: 5 },
    { time: '10:00', visitors: 15 },
    { time: '12:00', visitors: 25 },
    { time: '14:00', visitors: 20 },
    { time: '16:00', visitors: 35 },
    { time: '18:00', visitors: 10 },
    { time: '20:00', visitors: 2 },
  ];

  return { revenueData, visitorData };
};
