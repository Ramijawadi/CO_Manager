import { supabase } from '../../lib/supabase';
import type { Session, SessionInput, SessionCheckoutInput } from './types';

export const getActiveSessions = async (): Promise<Session[]> => {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      customer_id,
      entry_time,
      exit_time,
      status,
      time_cost,
      created_at,
      updated_at,
      customers!customer_id (id, full_name, email, phone),
      session_products (
        id, session_id, product_id, quantity, total_price,
        products (id, name, price)
      )
    `)
    .eq('status', 'active')
    .order('entry_time', { ascending: false });

  if (error) {
    console.error('Error fetching active sessions:', error);
    throw new Error(`Failed to fetch active sessions: ${error.message}`);
  }
  return data || [];
};

export const addSessionProduct = async (session_id: string, product_id: string, quantity: number, total_price: number): Promise<void> => {
  const { error } = await supabase
    .from('session_products')
    .insert([{ session_id, product_id, quantity, total_price }]);

  if (error) throw new Error(error.message);
};

export const removeSessionProduct = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('session_products')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
};

export const createSession = async (session: SessionInput): Promise<Session> => {
  const sessionData = {
    ...session,
    status: 'active',
    entry_time: new Date().toISOString(),
    time_cost: null, // Initialize as null
  };

  const { data, error } = await supabase
    .from('sessions')
    .insert([sessionData])
    .select(`
      id,
      customer_id,
      entry_time,
      exit_time,
      status,
      time_cost,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    console.error('Error creating session:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }
  return data;
};

export const checkoutSession = async (id: string, updateData: SessionCheckoutInput): Promise<Session> => {
  // Validate time_cost is a valid number if provided
  if (updateData.time_cost !== undefined && updateData.time_cost !== null) {
    if (typeof updateData.time_cost !== 'number' || updateData.time_cost < 0) {
      throw new Error('Invalid time_cost value. Must be a non-negative number.');
    }
  }

  const { data, error } = await supabase
    .from('sessions')
    .update({
      ...updateData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      id,
      customer_id,
      entry_time,
      exit_time,
      status,
      time_cost,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    console.error('Error checking out session:', error);
    throw new Error(`Failed to checkout session: ${error.message}`);
  }
  
  if (!data) {
    throw new Error('Session not found or update failed');
  }
  
  return data;
};
