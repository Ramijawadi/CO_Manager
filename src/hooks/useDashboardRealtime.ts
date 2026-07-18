import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeStatus = 'connected' | 'disconnected' | 'error';

/**
 * Single channel subscription for all dashboard real-time data.
 * Listens to sessions, session_products, subscriptions, and products
 * and invalidates the relevant React Query caches.
 */
export function useDashboardRealtime() {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase.channel('dashboard-realtime');

    // Sessions changes -> invalidate stats, active sessions list, charts
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        queryClient.invalidateQueries({ queryKey: ['activeSessionsList'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
      }
    );

    // Subscriptions changes -> invalidate stats
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subscriptions' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      }
    );

    // Session products changes -> invalidate stats, top products, charts
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'session_products' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        queryClient.invalidateQueries({ queryKey: ['topProducts'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
      }
    );

    // Products catalog changes -> invalidate top products
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['topProducts'] });
      }
    );

    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
      } else if (subStatus === 'CHANNEL_ERROR') {
        setStatus('error');
      } else if (subStatus === 'TIMED_OUT') {
        setStatus('disconnected');
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  return { status };
}
