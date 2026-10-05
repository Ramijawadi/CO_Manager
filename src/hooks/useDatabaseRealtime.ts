import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUrl } from '../lib/api';

export type RealtimeStatus = 'connected' | 'polling' | 'disconnected' | 'error';
type RealtimeConfig = { mode: 'streaming' } | { mode: 'polling'; intervalMs: number };

export function useDatabaseRealtime() {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const controller = new AbortController();
    const refresh = () => {
      void queryClient.invalidateQueries();
    };
    const initialize = async () => {
      try {
        const config = await apiRequest<RealtimeConfig>('/realtime/config', { signal: controller.signal });
        if (stopped) return;
        if (config.mode === 'polling') {
          const poll = async () => {
            try {
              await queryClient.invalidateQueries({ refetchType: 'active' }, { throwOnError: true });
              if (!stopped) setStatus('polling');
            } catch (error) {
              if (!stopped) {
                console.error('Database polling failed:', error);
                setStatus('error');
              }
            } finally {
              if (!stopped) timer = setTimeout(() => { void poll(); }, config.intervalMs);
            }
          };
          void poll();
          return;
        }
        source = new EventSource(apiUrl('/events'));
        source.addEventListener('ready', () => {
          setStatus('connected');
          refresh();
        });
        source.onmessage = event => {
          const change: unknown = JSON.parse(event.data);
          if (typeof change === 'object' && change !== null && 'table' in change) refresh();
        };
        source.onerror = () => setStatus('error');
      } catch (error) {
        if (!stopped) {
          console.error('Live database updates unavailable:', error);
          setStatus('error');
          timer = setTimeout(() => { void initialize(); }, 15000);
        }
      }
    };
    void initialize();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      source?.close();
    };
  }, [queryClient]);

  return { status };
}
