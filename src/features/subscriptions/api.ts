import { supabase } from '../../lib/supabase';
import type { Subscription, SubscriptionInput } from './types';

export const getSubscriptions = async (): Promise<Subscription[]> => {
  console.log('Fetching all subscriptions...');
  
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (subsError) {
    console.error('Error fetching subscriptions:', subsError);
    throw new Error(`Failed to fetch subscriptions: ${subsError.message}`);
  }

  if (!subs || subs.length === 0) return [];

  const customerIds = [...new Set(subs.map(s => s.customer_id))];
  const planIds = [...new Set(subs.map(s => s.plan_id).filter(Boolean))];

  const [customersResult, plansResult] = await Promise.all([
    customerIds.length > 0
      ? supabase.from('customers').select('id, full_name, email, phone').in('id', customerIds)
      : { data: [], error: null },
    planIds.length > 0
      ? supabase.from('plans').select('id, name, duration_days, price').in('id', planIds)
      : { data: [], error: null },
  ]);

  const customerMap = new Map((customersResult.data || []).map(c => [c.id, c]));
  const planMap = new Map((plansResult.data || []).map(p => [p.id, p]));

  return subs.map(s => ({
    ...s,
    customers: customerMap.get(s.customer_id) || null,
    plans: s.plan_id ? planMap.get(s.plan_id) || null : null,
  }));
};

export const getActiveSubscription = async (customerId: string): Promise<Subscription | null> => {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id,
      customer_id,
      plan_id,
      start_date,
      end_date,
      status,
      created_at,
      updated_at
    `)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .gte('end_date', today)
    .lte('start_date', today)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active subscription:', error);
    throw new Error(`Failed to fetch active subscription: ${error.message}`);
  }
  return data || null;
};

export const createSubscription = async (sub: SubscriptionInput): Promise<Subscription> => {
  const subscriptionData = {
    customer_id: sub.customer_id,
    plan_id: sub.plan_id,
    start_date: sub.start_date,
    end_date: sub.end_date,
    status: sub.status || 'active',
  };

  console.log('Creating subscription with data:', subscriptionData);

  const { data, error } = await supabase
    .from('subscriptions')
    .insert([subscriptionData])
    .select(`
      id,
      customer_id,
      plan_id,
      start_date,
      end_date,
      status,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    console.error('Error creating subscription:', error);
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
  
  if (!data) {
    throw new Error('Subscription created but no data returned');
  }

  console.log('Subscription created successfully:', data);
  return data;
};

export const updateSubscription = async (id: string, sub: Partial<SubscriptionInput>): Promise<Subscription> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .update(sub)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteSubscription = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
};
