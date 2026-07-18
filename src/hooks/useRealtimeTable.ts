import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PostgresChangesFilter = {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema?: string;
  table?: string;
};

/**
 * Reusable hook that subscribes to Supabase Realtime postgres_changes
 * and automatically invalidates React Query caches when data changes.
 *
 * @param queryKey - The React Query cache key to invalidate on changes
 * @param filters - Array of Postgres changes filters (event, schema, table)
 * @param options - Optional configuration
 */
export function useRealtimeTable(
  queryKey: string | string[],
  filters: PostgresChangesFilter[],
  options?: {
    enabled?: boolean;
    onStatusChange?: (status: 'connected' | 'disconnected' | 'error') => void;
  }
) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { enabled = true, onStatusChange } = options ?? {};

  // Stabilize filters reference with useMemo
  const stableFilters = useMemo(() => filters, [JSON.stringify(filters)]);

  // Stabilize queryKey reference
  const stableKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  // Build a unique channel name using both queryKey and table names
  const channelName = useMemo(() => {
    const keyPart = Array.isArray(stableKey) ? stableKey.join('-') : stableKey;
    const tablePart = stableFilters.map((f) => f.table).filter(Boolean).join('-');
    return `realtime:${keyPart}:${tablePart}`;
  }, [stableKey, stableFilters]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    // Remove any existing channel before creating a new one
    cleanup();

    const channel = supabase.channel(channelName);

    stableFilters.forEach((filter) => {
      channel.on(
        'postgres_changes',
        {
          event: filter.event,
          schema: filter.schema ?? 'public',
          table: filter.table,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: Array.isArray(stableKey) ? stableKey : [stableKey] });
        }
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatusChange?.('connected');
      } else if (status === 'CHANNEL_ERROR') {
        onStatusChange?.('error');
      } else if (status === 'TIMED_OUT') {
        onStatusChange?.('disconnected');
      }
    });

    channelRef.current = channel;

    return cleanup;
  }, [channelName, stableFilters, stableKey, enabled, queryClient, cleanup, onStatusChange]);

  return { cleanup };
}
