import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Topic = 'orders' | 'menu' | 'print-jobs' | 'printer-status' | 'settings';

const MAP: Record<Topic, QueryKey[]> = {
  orders: [['tables'], ['session'], ['orders'], ['bill']],
  menu: [['menu'], ['tables']],
  'print-jobs': [['orders'], ['printer-status']],
  'printer-status': [['printer-status']],
  settings: [['settings']],
};

export const keysForTopic = (t: Topic): QueryKey[] => MAP[t];

/** Broadcast-from-Database sinyaliyle ilgili sorgu anahtarlarını geçersiz kılar. */
export function useBroadcastInvalidation(topics: Topic[]): 'connected' | 'connecting' | 'offline' {
  const qc = useQueryClient();
  const [state, setState] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const topicKey = topics.join(',');

  useEffect(() => {
    let alive = true;
    const invalidateAll = () =>
      topics.forEach((t) => keysForTopic(t).forEach((k) => qc.invalidateQueries({ queryKey: k })));
    const channels = topics.map((topic) =>
      supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: '*' }, () =>
          keysForTopic(topic).forEach((k) => qc.invalidateQueries({ queryKey: k })),
        )
        .subscribe((status) => {
          if (!alive) return;
          if (status === 'SUBSCRIBED') {
            setState('connected');
            invalidateAll();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setState('offline');
          }
        }),
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') invalidateAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    void supabase.realtime.setAuth();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      channels.forEach((c) => void supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, topicKey]);

  return state;
}
