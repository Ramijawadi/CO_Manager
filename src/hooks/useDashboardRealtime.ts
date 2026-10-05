import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type RealtimeStatus = 'connected' | 'disconnected' | 'error';

export function useDashboardRealtime() {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events');
    const refresh = () => {
      void queryClient.invalidateQueries();
    };
    source.addEventListener('ready', () => {
      setStatus('connected');
      refresh();
    });
    source.onmessage = event => {
      const change: unknown = JSON.parse(event.data);
      if (typeof change === 'object' && change !== null && 'table' in change) refresh();
    };
    source.onerror = () => setStatus('error');
    return () => source.close();
  }, [queryClient]);

  return { status };
}
