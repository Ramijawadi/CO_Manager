import { supabase } from '../../lib/supabase';
import type { Settings, SettingsInput } from './types';

export const getSettings = async (): Promise<Settings> => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found, create it
      const { data: newData, error: insertError } = await supabase
        .from('settings')
        .insert([{ hourly_rate: 1.0 }])
        .select()
        .single();
      
      if (insertError) throw new Error(insertError.message);
      return newData;
    }
    throw new Error(error.message);
  }
  return data;
};

export const updateSettings = async (id: string, updates: SettingsInput): Promise<void> => {
  const { error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(error.message);
};
