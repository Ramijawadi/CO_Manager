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

export const AUTH_SYNC_STORAGE_KEY = 'comanager-auth-sync';

// Session cookies are shared by every tab, so tell the other open tabs to reload their session.
function notifyOtherTabs(): void {
  try {
    window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable (private mode); tabs still resync on focus or on a 403.
  }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/login', { method: 'POST', body: jsonBody({ email, password }) });
  notifyOtherTabs();
  return session;
}

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
  notifyOtherTabs();
}
