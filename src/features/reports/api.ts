import { supabase } from '../../lib/supabase';

export interface DailyClosure {
  id: string;
  closure_date: string;
  total_visitors: number;
  total_revenue: number;
  product_sales: number;
  time_revenue: number;
  created_at?: string;
}

export const getDailyClosures = async (): Promise<DailyClosure[]> => {
  const { data, error } = await supabase
    .from('daily_closures')
    .select('*')
    .order('closure_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
};

export const closeDay = async (date: string, metrics: Omit<DailyClosure, 'id' | 'created_at' | 'closure_date'>): Promise<void> => {
  const { error } = await supabase
    .from('daily_closures')
    .upsert([{ closure_date: date, ...metrics }], { onConflict: 'closure_date' });

  if (error) throw new Error(error.message);
};

export const getReportData = async (startDate: string, endDate: string) => {
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select(`
      *,
      customers (id, full_name, email),
      session_products (quantity, total_price, products (name))
    `)
    .gte('entry_time', startDate + 'T00:00:00Z')
    .lte('entry_time', endDate + 'T23:59:59Z');

  if (sessionsError) throw new Error(sessionsError.message);
  return sessions || [];
};
