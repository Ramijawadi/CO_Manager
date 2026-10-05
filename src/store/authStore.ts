import { create } from 'zustand';
import type { AuthSession, AuthUser, Role } from '../lib/auth';

interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  role: Role | null;
  setSession: (session: AuthSession | null) => void;
  setRole: (role: Role | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  setSession: (session) => set({ session, user: session?.user ?? null, role: session?.user.role ?? null }),
  setRole: (role) => set({ role }),
  signOut: () => set({ session: null, user: null, role: null }),
}));
