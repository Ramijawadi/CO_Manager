import { supabase } from '../../lib/supabase';

export interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  created_at: string;
}

let cachedFallbackPlans: Plan[] | null = null;
let detectedTableName: string | null = null;

const POSSIBLE_TABLE_NAMES = ['plans', 'subscription_plans', 'subscription_plan', 'subscription-plan'];

const getValidTableName = async (): Promise<string> => {
  if (detectedTableName) return detectedTableName;

  for (const name of POSSIBLE_TABLE_NAMES) {
    const { error } = await supabase.from(name).select('id').limit(1);
    if (!error) {
      detectedTableName = name;
      return name;
    }
  }

  return 'plans';
};

const getFallbackPlans = (): Plan[] => {
  if (!cachedFallbackPlans) {
    cachedFallbackPlans = [
      { id: 'plan-journalier', name: 'Journalier', duration_days: 1, price: 5, created_at: '' },
      { id: 'plan-hebdomadaire', name: 'Hebdomadaire', duration_days: 7, price: 25, created_at: '' },
      { id: 'plan-mensuel', name: 'Mensuel', duration_days: 30, price: 80, created_at: '' },
    ];
  }
  return cachedFallbackPlans;
};

export const getPlans = async (): Promise<Plan[]> => {
  const fallbacks = getFallbackPlans();
  try {
    const tableName = await getValidTableName();
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('price', { ascending: true });

    if (error || !data || data.length === 0) {
      return fallbacks;
    }

    const existingNames = new Set(data.map((p: any) => String(p.name).toLowerCase()));
    const missingFallbacks = fallbacks.filter(f => !existingNames.has(f.name.toLowerCase()));

    return [...data, ...missingFallbacks].sort((a, b) => Number(a.price) - Number(b.price));
  } catch {
    return fallbacks;
  }
};

export const updatePlan = async (id: string, updates: Partial<Plan>): Promise<void> => {
  const tableName = await getValidTableName();
  const { error } = await supabase
    .from(tableName)
    .update(updates)
    .eq('id', id);

  if (error) {
    // If updating database fails, update fallback in-memory cache
    if (cachedFallbackPlans) {
      const idx = cachedFallbackPlans.findIndex(p => p.id === id);
      if (idx !== -1) {
        cachedFallbackPlans[idx] = { ...cachedFallbackPlans[idx], ...updates };
      }
    }
  }
};

export const createPlan = async (plan: Omit<Plan, 'id' | 'created_at'>): Promise<void> => {
  const tableName = await getValidTableName();
  const { error } = await supabase
    .from(tableName)
    .insert([plan]);

  if (error) {
    const newPlan: Plan = {
      ...plan,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    if (!cachedFallbackPlans) cachedFallbackPlans = getFallbackPlans();
    cachedFallbackPlans.push(newPlan);
  }
};

export const deletePlan = async (id: string): Promise<void> => {
  const tableName = await getValidTableName();
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);

  if (error) {
    if (cachedFallbackPlans) {
      cachedFallbackPlans = cachedFallbackPlans.filter(p => p.id !== id);
    }
  }
};
