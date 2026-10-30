import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_SYNC_STORAGE_KEY, getSession } from '../lib/auth';
import { useAuthStore } from '../store/authStore';

/**
 * Keeps the in-memory role in sync with the session cookie, which is shared by all tabs.
 * Without this, a tab opened as one account keeps showing that account's actions after
 * another tab signs in with a different role, and the server rejects them with a 403.
 */
export function useSessionSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let inFlight = false;

    const revalidate = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await getSession();
        const { user, setSession, signOut } = useAuthStore.getState();
        if (!next) {
          signOut();
          queryClient.clear();
        } else if (next.user.id !== user?.id || next.user.role !== user?.role) {
          setSession(next);
          queryClient.clear();
        }
      } catch {
        // Network errors are handled by the regular queries; keep the current session.
      } finally {
        inFlight = false;
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_STORAGE_KEY) void revalidate();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const onAuthChanged = () => void revalidate();

    window.addEventListener('storage', onStorage);
    window.addEventListener('auth-changed', onAuthChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth-changed', onAuthChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queryClient]);
}
