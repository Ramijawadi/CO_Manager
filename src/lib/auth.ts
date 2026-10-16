import { ApiError, apiRequest, jsonBody } from './api';

export type Role = 'admin' | 'employee' | 'staff' | 'demo';
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string;
}
export interface AuthSession {
  user: AuthUser;
}

export const signIn = (email: string, password: string): Promise<AuthSession> =>
  apiRequest('/auth/login', { method: 'POST', body: jsonBody({ email, password }) });

export const registerEmployee = (
  fullName: string, email: string, password: string, phone?: string,
): Promise<{ user: AuthUser; status: 'active' | 'pending' }> =>
  apiRequest('/auth/register', {
    method: 'POST',
    body: jsonBody({ fullName, email, password, ...(phone ? { phone } : {}) }),
  });

export async function getSession(): Promise<AuthSession | null> {
  try {
    return await apiRequest<AuthSession>('/auth/session');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}
