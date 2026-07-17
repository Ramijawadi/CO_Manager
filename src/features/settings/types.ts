export interface Settings {
  id: string;
  hourly_rate: number;
}

export type SettingsInput = Omit<Settings, 'id'>;
