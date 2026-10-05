import { apiRequest, jsonBody } from '../../lib/api';
import type { Settings, SettingsInput } from './types';

export const getSettings = async (): Promise<Settings> => {
  const rows = await apiRequest<Settings[]>('/settings?limit=1');
  if (!rows[0]) throw new Error('Database settings are missing. Run npm run setup-db.');
  return rows[0];
};
export const updateSettings = async (id: string, updates: SettingsInput): Promise<void> => {
  await apiRequest(`/settings/${id}`, { method: 'PATCH', body: jsonBody(updates) });
};
