import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

type Role = 'admin' | 'staff' | null;

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role;
  setSession: (session: Session | null) => void;
  setRole: (role: Role) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setRole: (role) => set({ role }),
  signOut: () => set({ session: null, user: null, role: null }),
}));
