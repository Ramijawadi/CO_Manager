import { useState, useCallback } from 'react';
import { useRealtimeTable } from './useRealtimeTable';

type RealtimeStatus = 'connected' | 'disconnected' | 'error';

/**
 * Hook that manages all real-time subscriptions for the Dashboard page.
 * Subscribes to sessions, subscriptions, session_products, and products tables.
 * Returns the connection status for displaying a live indicator.
 */
export function useDashboardRealtime() {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');

  const onStatusChange = useCallback((s: RealtimeStatus) => {
    setStatus(s);
  }, []);

  // Each unique (queryKey, tables) pair gets its own channel.
  // Combine multiple table filters into one call per queryKey.

  // Dashboard stats: invalidate on sessions or subscriptions changes
  useRealtimeTable(
    ['dashboardStats'],
    [
      { event: '*', table: 'sessions' },
      { event: '*', table: 'subscriptions' },
    ],
    { onStatusChange }
  );

  // Dashboard stats + top products: invalidate on product sales changes
  useRealtimeTable(
    ['dashboardStats', 'topProducts'],
    [{ event: '*', table: 'session_products' }]
  );

  // Top products: invalidate on product catalog changes
  useRealtimeTable(
    ['topProducts'],
    [{ event: '*', table: 'products' }]
  );

  // Dashboard charts: invalidate on session + product sales changes
  useRealtimeTable(
    ['dashboardCharts'],
    [
      { event: '*', table: 'sessions' },
      { event: '*', table: 'session_products' },
    ]
  );

  return { status };
}
