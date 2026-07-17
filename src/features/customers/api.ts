import { supabase } from '../../lib/supabase';
import type { Customer, CustomerInput } from './types';

export const getCustomers = async (): Promise<Customer[]> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
};

export const createCustomer = async (customer: CustomerInput): Promise<Customer> => {
  const { data, error } = await supabase
    .from('customers')
    .insert([customer])
    .select()
    .single();

  if (error) {
    if (error.message.includes('customers_email_key')) {
      throw new Error('A customer with this email address already exists.');
    }
    throw new Error(error.message);
  }
  return data;
};

export const updateCustomer = async (id: string, customer: CustomerInput): Promise<Customer> => {
  const { data, error } = await supabase
    .from('customers')
    .update(customer)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.message.includes('customers_email_key')) {
      throw new Error('A customer with this email address already exists.');
    }
    throw new Error(error.message);
  }
  return data;
};

export const deleteCustomer = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
};
