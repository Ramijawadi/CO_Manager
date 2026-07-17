import { supabase } from '../../lib/supabase';

export interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  created_at: string;
}

let cachedFallbackPlans: Plan[] | null = null;

const getFallbackPlans = (): Plan[] => {
  if (!cachedFallbackPlans) {
    cachedFallbackPlans = [
      { id: crypto.randomUUID(), name: 'Hebdomadaire', duration_days: 7, price: 25, created_at: '' },
      { id: crypto.randomUUID(), name: 'Mensuel', duration_days: 30, price: 80, created_at: '' },
    ];
  }
  return cachedFallbackPlans;
};

export const getPlans = async (): Promise<Plan[]> => {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (error || !data || data.length === 0) {
      return getFallbackPlans();
    }
    return data;
  } catch {
    return getFallbackPlans();
  }
};
